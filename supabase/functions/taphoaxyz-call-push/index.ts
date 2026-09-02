import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { classifyPushSendError, shouldFailPushDelivery } from "./delivery-policy.ts";

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

type PushPayload = Record<string, unknown>;

type SendOptions = {
  deviceId?: string;
  ttl?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

async function sendToProfile(
  service: ReturnType<typeof createClient>,
  vapid: VapidConfig,
  profileId: string,
  payload: PushPayload,
  options: SendOptions = {},
) {
  const { data: subscriptions, error } = await service.rpc("chat_service_push_targets", {
    p_profile_id: profileId,
    p_device_id: options.deviceId ?? null,
  });
  if (error) throw new Error("push_target_lookup_failed");
  if (!subscriptions?.length) return { delivered: 0, expired: 0, failed: 0 };

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const encoded = JSON.stringify(payload);
  let delivered = 0;
  let expired = 0;
  let failed = 0;
  let lastFailure: string | null = null;

  for (const row of subscriptions) {
    const subscription = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth_key },
    };
    try {
      await webpush.sendNotification(subscription, encoded, {
        TTL: options.ttl ?? 60,
        urgency: options.urgency ?? "high",
      });
      delivered += 1;
    } catch (error) {
      const failure = classifyPushSendError(error);
      if (failure.expired) {
        expired += 1;
        await service
          .from("chat_call_push_subscriptions")
          .delete()
          .eq("id", row.subscription_id);
      } else {
        failed += 1;
        lastFailure = failure.reason;
      }
    }
  }

  if (shouldFailPushDelivery(delivered, failed)) {
    throw new Error(`push_delivery_failed:${lastFailure || "unknown"}`);
  }

  if (failed > 0) {
    console.warn(JSON.stringify({
      event: "web_push_partial_failure",
      delivered,
      expired,
      failed,
      last_failure: lastFailure,
    }));
  }

  return { delivered, expired, failed };
}

function messagePreview(value: unknown) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "Bạn có một tin nhắn mới";
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

async function markOutboxProcessed(
  service: ReturnType<typeof createClient>,
  eventId: string,
  dispatchToken: string,
  lastError: string | null,
) {
  const { error } = await service
    .from("chat_notification_outbox")
    .update({
      processed_at: new Date().toISOString(),
      last_error: lastError,
    })
    .eq("id", eventId)
    .eq("dispatch_token", dispatchToken)
    .is("processed_at", null);
  if (error) throw new Error("outbox_update_failed");
}

async function markOutboxFailed(
  service: ReturnType<typeof createClient>,
  eventId: string,
  dispatchToken: string,
  lastError: string,
) {
  const { error } = await service
    .from("chat_notification_outbox")
    .update({ last_error: lastError })
    .eq("id", eventId)
    .eq("dispatch_token", dispatchToken)
    .is("processed_at", null);
  if (error) throw new Error("outbox_update_failed");
}

async function dispatchEvent(
  service: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
): Promise<Response> {
  const eventId = String(body.event_id || "");
  const dispatchToken = String(body.dispatch_token || "");
  if (!isUuid(eventId) || !isUuid(dispatchToken)) {
    return json(400, { error: "invalid_dispatch_event" });
  }

  const { data: eventRow, error: eventError } = await service
    .from("chat_notification_outbox")
    .select("id,event_type,source_id,recipient_profile_id,dispatch_token,processed_at")
    .eq("id", eventId)
    .eq("dispatch_token", dispatchToken)
    .maybeSingle();
  if (eventError) return json(500, { error: "outbox_lookup_failed" });
  if (!eventRow) return json(403, { error: "invalid_dispatch_capability" });
  if (eventRow.processed_at) return json(200, { ok: true, duplicate: true });

  let vapid: VapidConfig;
  try {
    vapid = await ensureVapid(service);
  } catch {
    return json(503, { error: "web_push_not_configured" });
  }

  try {
    if (eventRow.event_type === "chat_message") {
      const { data: message, error: messageError } = await service
        .from("chat_messages")
        .select("id,conversation_id,sender_id,type,text,revoked_at")
        .eq("id", eventRow.source_id)
        .maybeSingle();
      if (messageError || !message) throw new Error("message_not_found");
      if (message.revoked_at) throw new Error("message_revoked");

      const { data: conversation, error: conversationError } = await service
        .from("chat_conversations")
        .select("id,type")
        .eq("id", message.conversation_id)
        .maybeSingle();
      if (conversationError || conversation?.type !== "direct") throw new Error("direct_conversation_required");

      const { data: members, error: memberError } = await service
        .from("chat_conversation_members")
        .select("profile_id,is_muted")
        .eq("conversation_id", message.conversation_id)
        .is("left_at", null)
        .limit(3);
      if (memberError) throw new Error("member_lookup_failed");

      const senderMember = members?.find((row) => row.profile_id === message.sender_id);
      const recipientMember = members?.find((row) => row.profile_id === eventRow.recipient_profile_id);
      if (!senderMember || !recipientMember || message.sender_id === eventRow.recipient_profile_id) {
        throw new Error("recipient_mismatch");
      }

      const { data: sender, error: senderError } = await service
        .from("chat_profiles")
        .select("display_name")
        .eq("id", message.sender_id)
        .maybeSingle();
      const { data: recipient, error: recipientError } = await service
        .from("chat_profiles")
        .select("is_admin")
        .eq("id", eventRow.recipient_profile_id)
        .maybeSingle();
      if (senderError || recipientError || !recipient) throw new Error("profile_lookup_failed");

      const result = recipientMember.is_muted
        ? { delivered: 0, expired: 0, failed: 0, muted: true }
        : await sendToProfile(service, vapid, eventRow.recipient_profile_id, {
          type: "chat_message",
          message_id: message.id,
          conversation_id: message.conversation_id,
          title: "Tin nhắn mới",
          body: `${sender?.display_name || "TAPHOA"}: ${messagePreview(message.text)}`,
          navigate: recipient.is_admin ? `./admin/?conversation=${message.conversation_id}` : "./",
          tag: `chat-${message.conversation_id}`,
          badge: 1,
        }, { ttl: 300, urgency: "normal" });

      await markOutboxProcessed(service, eventId, dispatchToken, null);
      return json(200, { ok: true, ...result });
    }

    if (eventRow.event_type === "incoming_call") {
      const { data: call, error: callError } = await service
        .from("chat_calls")
        .select("id,conversation_id,caller_profile_id,callee_profile_id,state")
        .eq("id", eventRow.source_id)
        .maybeSingle();
      if (callError || !call) throw new Error("call_not_found");
      if (call.state !== "ringing") throw new Error("call_not_ringing");
      if (call.callee_profile_id !== eventRow.recipient_profile_id) throw new Error("recipient_mismatch");

      const { data: caller, error: callerError } = await service
        .from("chat_profiles")
        .select("display_name")
        .eq("id", call.caller_profile_id)
        .maybeSingle();
      const { data: callee, error: calleeError } = await service
        .from("chat_profiles")
        .select("is_admin")
        .eq("id", call.callee_profile_id)
        .maybeSingle();
      if (callerError || calleeError || !callee) throw new Error("profile_lookup_failed");

      const result = await sendToProfile(service, vapid, call.callee_profile_id, {
        type: "incoming_call",
        call_id: call.id,
        conversation_id: call.conversation_id,
        title: "Cuộc gọi TAPHOA",
        body: `${caller?.display_name || "Có người"} đang gọi cho bạn`,
        navigate: callee.is_admin ? `./admin/?conversation=${call.conversation_id}` : "./",
        tag: `call-${call.id}`,
        badge: 1,
      }, { ttl: 60, urgency: "high" });

      await markOutboxProcessed(service, eventId, dispatchToken, null);
      return json(200, { ok: true, ...result });
    }

    throw new Error("invalid_event_type");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "dispatch_failed";
    try {
      if (reason.startsWith("push_delivery_failed:")) {
        await markOutboxFailed(service, eventId, dispatchToken, reason.slice(0, 500));
      } else {
        await markOutboxProcessed(service, eventId, dispatchToken, reason.slice(0, 500));
      }
    } catch {
      // Preserve the original dispatch error; transport failures remain unprocessed for diagnosis/manual retry.
    }
    return json(500, { error: "dispatch_failed" });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(503, { error: "server_not_configured" });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const action = String(body.action || "");
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  if (action === "dispatch_event") {
    return dispatchEvent(service, body);
  }

  const token = bearerToken(req);
  if (!token) return json(401, { error: "unauthorized" });

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "unauthorized" });

  let vapid: VapidConfig;
  try {
    vapid = await ensureVapid(service);
  } catch {
    return json(503, { error: "web_push_not_configured" });
  }

  if (action === "config") {
    return json(200, { public_key: vapid.publicKey });
  }

  if (action === "test") {
    const { data: profile, error: profileError } = await service
      .from("chat_profiles")
      .select("id,is_admin")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (profileError || !profile?.id) return json(403, { error: "profile_required" });

    const deviceId = String(body.device_id || "");
    if (!isUuid(deviceId)) return json(400, { error: "invalid_device_id" });

    try {
      const result = await sendToProfile(service, vapid, profile.id, {
        type: "test_notification",
        title: "TAPHOA",
        body: "Thông báo TAPHOA đã sẵn sàng",
        navigate: profile.is_admin ? "./admin/" : "./",
        tag: `test-${deviceId}`,
        badge: 0,
      }, { deviceId, ttl: 60, urgency: "high" });
      return json(200, { ok: true, ...result });
    } catch (error) {
      return json(500, { error: error instanceof Error ? error.message : "push_test_failed" });
    }
  }

  return json(400, { error: "invalid_action" });
});
