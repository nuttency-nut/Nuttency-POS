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
  // Exact match
  if (!pattern.includes("/")) {
    return clientIp === pattern;
  }
  // CIDR match (IPv4 only for simplicity)
  const [subnet, bitsStr] = pattern.split("/");
  const bits = parseInt(bitsStr, 10);
  const mask = ~(2 ** (32 - bits) - 1);

  const ipToNum = (ip: string) =>
    ip.split(".").reduce((acc, oct) => ((acc << 8) + parseInt(oct, 10)) >>> 0, 0) >>> 0;

  try {
    return (ipToNum(clientIp) & mask) === (ipToNum(subnet) & mask);
  } catch {
    return false;
  }
}

async function isAllowedWifiIp(clientIp: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("allowed_wifi_ips")
    .select("ip_pattern")
    .eq("is_active", true);

  if (!data || data.length === 0) {
    // No restrictions configured — allow everything
    return true;
  }

  return data.some((row: { ip_pattern: string }) => ipMatchesPattern(clientIp, row.ip_pattern));
}

async function uploadPhoto(
  userId: string,
  photoBase64: string,
): Promise<string | null> {
  // Decode base64
  const binaryStr = atob(photoBase64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const ext = "jpg";
  const fileName = `${userId}/${Date.now()}.${ext}`;
  const path = `${fileName}`;

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

  // Get auth header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify user token
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

  // Parse body
  let body: { photo_base64?: string; device_info?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Determine action: if user has a session with no checkout → checkout, else checkin
  const todayStr = new Date().toISOString().split("T")[0];

  // Find today's work session for this user
  const { data: existingSession } = await supabaseAdmin
    .from("work_sessions")
    .select("id, latest_checkout_at")
    .eq("user_id", userId)
    .eq("session_date", todayStr)
    .maybeSingle();

  const isCheckout = existingSession !== null && existingSession.latest_checkout_at === null;
  const actionType = isCheckout ? "checkout" : "checkin";

  // Check WiFi IP
  const ipAllowed = await isAllowedWifiIp(clientIp);

  // Upload photo if provided
  let photoUrl: string | null = null;
  if (body.photo_base64) {
    photoUrl = await uploadPhoto(userId, body.photo_base64);
  }

  // Get or create work session
  let workSessionId: string;

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
  if (actionType === "checkin") {
    await supabaseAdmin
      .from("work_sessions")
      .update({
        earliest_checkin_at: new Date().toISOString(),
        total_records: (existingSession?.total_records ?? 0) + 1,
      })
      .eq("id", workSessionId);
  } else {
    await supabaseAdmin
      .from("work_sessions")
      .update({
        latest_checkout_at: new Date().toISOString(),
        total_records: (existingSession?.total_records ?? 0) + 1,
      })
      .eq("id", workSessionId);
  }

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
