import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request) {
  const value = req.headers.get("Authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function normalizeVapid(value: unknown): VapidConfig | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const publicKey = String(row.public_key || "");
  const privateKey = String(row.private_key || "");
  const subject = String(row.subject || "mailto:admin@taphoa.xyz");
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

async function ensureVapid(service: ReturnType<typeof createClient>): Promise<VapidConfig> {
  const envPublic = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") || "";
  const envPrivate = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") || "";
  const envSubject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT") || "mailto:admin@taphoa.xyz";
  if (envPublic && envPrivate) {
    return { publicKey: envPublic, privateKey: envPrivate, subject: envSubject };
  }

  const existing = await service.rpc("chat_service_get_call_push_vapid");
  if (existing.error) throw new Error("vapid_vault_read_failed");
  const stored = normalizeVapid(existing.data);
  if (stored) return stored;

  const generated = webpush.generateVAPIDKeys();
  const ensured = await service.rpc("chat_service_ensure_call_push_vapid", {
    p_public_key: generated.publicKey,
    p_private_key: generated.privateKey,
    p_subject: envSubject,
  });
  if (ensured.error) throw new Error("vapid_vault_bootstrap_failed");
  const canonical = normalizeVapid(ensured.data);
  if (!canonical) throw new Error("vapid_vault_invalid");
  return canonical;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(503, { error: "server_not_configured" });

  const token = bearerToken(req);
  if (!token) return json(401, { error: "unauthorized" });

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "unauthorized" });

  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const action = String(body.action || "send");

  let vapid: VapidConfig;
  try {
    vapid = await ensureVapid(service);
  } catch {
    return json(503, { error: "web_push_not_configured" });
  }

  if (action === "config") {
    return json(200, { public_key: vapid.publicKey });
  }

  if (action !== "send") return json(400, { error: "invalid_action" });

  const callId = String(body.call_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(callId)) return json(400, { error: "invalid_call_id" });

  const { data: profile, error: profileError } = await service
    .from("chat_profiles")
    .select("id")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile?.id) return json(403, { error: "profile_required" });

  const { data: call, error: callError } = await service
    .from("chat_calls")
    .select("id,conversation_id,caller_profile_id,callee_profile_id,state")
    .eq("id", callId)
    .maybeSingle();
  if (callError || !call) return json(404, { error: "call_not_found" });
  if (call.state !== "ringing") return json(409, { error: "call_not_ringing" });
  if (call.caller_profile_id !== profile.id) return json(403, { error: "not_caller" });

  const { data: subscriptions, error: subscriptionError } = await service
    .from("chat_call_push_subscriptions")
    .select("id,device_id,endpoint,p256dh,auth_key")
    .eq("profile_id", call.callee_profile_id);
  if (subscriptionError) return json(500, { error: "subscription_lookup_failed" });
  if (!subscriptions?.length) return json(200, { ok: true, delivered: 0, expired: 0 });

  const deviceIds = subscriptions.map((row) => row.device_id);
  const { data: activeDevices, error: devicesError } = await service
    .from("chat_devices")
    .select("id")
    .in("id", deviceIds)
    .eq("profile_id", call.callee_profile_id)
    .is("revoked_at", null);
  if (devicesError) return json(500, { error: "device_lookup_failed" });
  const activeDeviceIds = new Set((activeDevices || []).map((row) => String(row.id)));

  const [{ data: caller }, { data: callee }] = await Promise.all([
    service.from("chat_profiles").select("display_name").eq("id", call.caller_profile_id).maybeSingle(),
    service.from("chat_profiles").select("is_admin").eq("id", call.callee_profile_id).maybeSingle(),
  ]);

  const callerName = caller?.display_name || "Có người";
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const payload = JSON.stringify({
    type: "incoming_call",
    call_id: call.id,
    conversation_id: call.conversation_id,
    title: "Cuộc gọi TAPHOA",
    body: `${callerName} đang gọi cho bạn`,
    navigate: callee?.is_admin ? "./admin/" : "./",
    tag: `call-${call.id}`,
    badge: 1,
  });

  let delivered = 0;
  let expired = 0;
  for (const row of subscriptions) {
    if (!activeDeviceIds.has(String(row.device_id))) continue;
    const subscription = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth_key },
    };
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 60, urgency: "high" });
      delivered += 1;
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        expired += 1;
        await service.from("chat_call_push_subscriptions").delete().eq("id", row.id);
      }
    }
  }

  return json(200, { ok: true, delivered, expired });
});
