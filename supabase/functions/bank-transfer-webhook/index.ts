import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BANK_WEBHOOK_SECRET = Deno.env.get("BANK_WEBHOOK_SECRET") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase runtime env");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, signature, x-webhook-signature, x-hmac-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizeText(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.-]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractValue(payload: any, paths: string[][]) {
  for (const path of paths) {
    let current = payload;
    for (const key of path) {
      if (current == null || typeof current !== "object" || !(key in current)) {
        current = undefined;
        break;
      }
      current = current[key];
    }
    if (current !== undefined && current !== null) return current;
  }
  return null;
}

async function hmacSha256(secret: string, message: string) {
  const keyData = new TextEncoder().encode(secret);
  const msgData = new TextEncoder().encode(message);
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, msgData);
  const bytes = new Uint8Array(signature);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const base64 = btoa(String.fromCharCode(...bytes));
  return { hex, base64 };
}

function getIncomingSignature(headers: Headers) {
  return (
    headers.get("x-signature") ||
    headers.get("x-webhook-signature") ||
    headers.get("x-hmac-signature") ||
    headers.get("signature") ||
    ""
  ).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const bodyText = await req.text();
  let payload: any;
  try {
    payload = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (BANK_WEBHOOK_SECRET) {
    const incomingSignatureRaw = getIncomingSignature(req.headers);
    const incomingSignature = incomingSignatureRaw.replace(/^sha256=/i, "");

    if (!incomingSignature) {
      return new Response(JSON.stringify({ ok: false, error: "missing_signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expected = await hmacSha256(BANK_WEBHOOK_SECRET, bodyText);
    const isValid = incomingSignature === expected.hex || incomingSignature === expected.base64;

    if (!isValid) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const amount = toNumber(
    extractValue(payload, [
      ["amount"],
      ["transferAmount"],
      ["value"],
      ["transactionAmount"],
      ["data", "amount"],
      ["data", "transferAmount"],
      ["data", "value"],
    ])
  );

  const transferContentRaw = String(
    extractValue(payload, [
      ["content"],
      ["description"],
      ["addInfo"],
      ["message"],
      ["data", "content"],
      ["data", "description"],
      ["data", "addInfo"],
      ["data", "message"],
    ]) ?? ""
  );

  const transactionId = String(
    extractValue(payload, [
      ["transactionId"],
      ["transaction_id"],
      ["txnId"],
      ["reference"],
      ["id"],
      ["data", "transactionId"],
      ["data", "transaction_id"],
      ["data", "txnId"],
      ["data", "reference"],
      ["data", "id"],
    ]) ?? ""
  ).trim();

  if (amount == null || !transferContentRaw.trim()) {
    return new Response(JSON.stringify({ ok: false, error: "missing_amount_or_content" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const normalizedIncomingContent = normalizeText(transferContentRaw);
  const roundedAmount = Math.round(amount);

  const { data: orders, error: queryError } = await supabase
    .from("orders")
    .select("id,order_number,total_amount,status,payment_method,transfer_content,created_at")
    .eq("payment_method", "transfer")
    .in("status", ["pending", "completed"])
    .order("created_at", { ascending: false })
    .limit(400);

  if (queryError) {
    return new Response(JSON.stringify({ ok: false, error: "query_failed", detail: queryError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const byAmount = (orders ?? []).filter((order) => Math.round(Number(order.total_amount ?? 0)) === roundedAmount);

  const match = byAmount.find((order) => {
    const expectedContent = order.transfer_content?.trim();
    const normalizedExpectedContent = expectedContent ? normalizeText(expectedContent) : "";
    const normalizedOrderNumber = normalizeText(order.order_number || "");

    return (
      (normalizedExpectedContent && normalizedIncomingContent.includes(normalizedExpectedContent)) ||
      (normalizedOrderNumber && normalizedIncomingContent.includes(normalizedOrderNumber))
    );
  });

  if (!match) {
    return new Response(
      JSON.stringify({
        ok: true,
        matched: false,
        reason: "no_order_match",
      }),
      {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  if (match.status === "completed") {
    return new Response(
      JSON.stringify({
        ok: true,
        matched: true,
        updated: false,
        order_id: match.id,
        order_number: match.order_number,
        reason: "already_completed",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const updatePayload: Record<string, unknown> = {
    status: "completed",
    paid_at: new Date().toISOString(),
    payment_payload: payload,
  };

  if (transactionId) {
    updatePayload.payment_transaction_id = transactionId;
  }

  const { data: updatedOrder, error: updateError } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", match.id)
    .eq("status", "pending")
    .select("id,order_number,status")
    .maybeSingle();

  if (updateError) {
    const code = (updateError as { code?: string }).code;
    if (code === "23505") {
      return new Response(JSON.stringify({ ok: true, matched: true, updated: false, reason: "duplicate_transaction_id" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "update_failed", detail: updateError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      matched: true,
      updated: true,
      order_id: updatedOrder?.id ?? match.id,
      order_number: updatedOrder?.order_number ?? match.order_number,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
