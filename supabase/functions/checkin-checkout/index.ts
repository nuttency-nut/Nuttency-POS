import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STORAGE_BUCKET = "checkin-photos";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase runtime env");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function ipMatchesPattern(clientIp: string, pattern: string): boolean {
  if (!pattern.includes("/")) {
    return clientIp === pattern;
  }
  const [subnet, bitsStr] = pattern.split("/");
  const bits = parseInt(bitsStr, 10);
  if (bits < 0 || bits > 32) return false;
  const mask = ~((2 ** (32 - bits)) - 1) >>> 0;

  const ipToNum = (ip: string) =>
    ip.split(".").reduce((acc, oct) => ((acc << 8) + parseInt(oct, 10)) >>> 0, 0) >>> 0;

  try {
    return (ipToNum(clientIp) & mask) === (ipToNum(subnet) & mask);
  } catch {
    return false;
  }
}

async function getStoreWifiPattern(userId: string): Promise<string | null> {
  // Get the user's assigned store
  const { data: assignment, error: assignError } = await supabaseAdmin
    .from("user_store_assignments")
    .select("store_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (assignError || !assignment?.store_id) {
    return null; // No store assigned — no restriction
  }

  // Get the WiFi IP pattern for that store
  const { data: store, error: storeError } = await supabaseAdmin
    .from("store_definitions")
    .select("wifi_ip_pattern")
    .eq("id", assignment.store_id)
    .maybeSingle();

  if (storeError || !store) {
    return null;
  }

  return (store as { wifi_ip_pattern?: string }).wifi_ip_pattern ?? null;
}

async function isWifiAllowed(clientIp: string, userId: string): Promise<boolean> {
  const pattern = await getStoreWifiPattern(userId);

  if (!pattern || !pattern.trim()) {
    // No restriction configured for this user's store
    return true;
  }

  return ipMatchesPattern(clientIp, pattern.trim());
}

async function uploadPhoto(
  userId: string,
  photoBase64: string,
): Promise<string | null> {
  const binaryStr = atob(photoBase64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const ext = "jpg";
  const fileName = `${userId}/${Date.now()}.${ext}`;
  const path = fileName;

  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (error) {
    console.error("Storage upload error:", error.message);
    return null;
  }

  const { data: urlData } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return urlData.publicUrl;
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = userData.user.id;
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip")?.trim() ??
    "unknown";

  let body: { photo_base64?: string; device_info?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify WiFi IP against assigned store
  const ipAllowed = await isWifiAllowed(clientIp, userId);
  if (!ipAllowed) {
    const storePattern = await getStoreWifiPattern(userId);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "wifi_ip_mismatch",
        detail: `WiFi IP không hợp lệ. Vui lòng check-in tại cửa hàng được gán (WiFi: ${storePattern ?? "chưa cấu hình"}).`,
      }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Determine action type
  const todayStr = new Date().toISOString().split("T")[0];

  const { data: existingSession } = await supabaseAdmin
    .from("work_sessions")
    .select("id, latest_checkout_at, total_records")
    .eq("user_id", userId)
    .eq("session_date", todayStr)
    .maybeSingle();

  const hasSession = existingSession !== null;
  const hasCheckout = existingSession?.latest_checkout_at !== null;
  const actionType = hasSession && !hasCheckout ? "checkout" : "checkin";

  // Upload photo if provided
  let photoUrl: string | null = null;
  if (body.photo_base64) {
    photoUrl = await uploadPhoto(userId, body.photo_base64);
  }

  // Get or create work session
  let workSessionId: string;
  let currentTotal = existingSession?.total_records ?? 0;

  if (existingSession) {
    workSessionId = existingSession.id;
  } else {
    const { data: newSession, error: sessionError } = await supabaseAdmin
      .from("work_sessions")
      .insert({ user_id: userId, session_date: todayStr })
      .select("id")
      .single();

    if (sessionError || !newSession) {
      return new Response(JSON.stringify({ ok: false, error: "session_create_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    workSessionId = newSession.id;
  }

  // Insert check-in record
  const { data: record, error: recordError } = await supabaseAdmin
    .from("checkin_records")
    .insert({
      work_session_id: workSessionId,
      user_id: userId,
      action_type: actionType,
      action_at: new Date().toISOString(),
      photo_url: photoUrl,
      client_ip: clientIp,
      is_verified_ip: ipAllowed,
      device_info: body.device_info ?? {},
    })
    .select()
    .single();

  if (recordError) {
    return new Response(JSON.stringify({ ok: false, error: "record_insert_failed", detail: recordError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Update work session summary
  const updatePayload: Record<string, unknown> = {
    total_records: currentTotal + 1,
  };
  if (actionType === "checkin") {
    updatePayload.earliest_checkin_at = new Date().toISOString();
  } else {
    updatePayload.latest_checkout_at = new Date().toISOString();
  }

  await supabaseAdmin
    .from("work_sessions")
    .update(updatePayload)
    .eq("id", workSessionId);

  return new Response(
    JSON.stringify({
      ok: true,
      action_type: actionType,
      ip_allowed: ipAllowed,
      photo_url: photoUrl,
      record,
      work_session_id: workSessionId,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
