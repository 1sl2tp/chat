import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function bearerToken(req: Request): string {
  const value = req.headers.get("Authorization") || "";
  return value.match(/^Bearer\s+(.+)$/i)?.[1] || "";
}

function normalizeUsername(value: unknown): string {
  return String(value || "").trim().replace(/^@+/, "").toLowerCase();
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
  const authResult = await authClient.auth.getUser(token);
  if (authResult.error || !authResult.data.user) return json(401, { error: "unauthorized" });

  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const adminResult = await service
    .from("chat_profiles")
    .select("id")
    .eq("auth_user_id", authResult.data.user.id)
    .eq("is_admin", true)
    .eq("user_level", 4)
    .maybeSingle();
  if (adminResult.error || !adminResult.data?.id) return json(403, { error: "admin_required" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  if (body.action !== "create_user2") return json(400, { error: "invalid_action" });

  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  if (username === "admin") return json(400, { error: "reserved_username" });
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return json(400, { error: "invalid_username" });
  if (password.length < 6 || password.length > 128) return json(400, { error: "invalid_password" });

  const existingProfile = await service
    .from("chat_profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existingProfile.error) return json(500, { error: "profile_lookup_failed" });
  if (existingProfile.data) return json(409, { error: "username_exists" });

  const email = `${username}@taphoa.chat`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: username },
  });
  if (created.error || !created.data.user) {
    const message = String(created.error?.message || "").toLowerCase();
    return json(message.includes("already") ? 409 : 500, {
      error: message.includes("already") ? "username_exists" : "auth_create_failed",
    });
  }

  const authUserId = created.data.user.id;
  const profileInsert = await service.from("chat_profiles").insert({
    auth_user_id: authUserId,
    identity_type: "taphoa",
    display_name: username,
    username,
    user_level: 2,
    is_admin: false,
  });

  if (profileInsert.error) {
    await service.auth.admin.deleteUser(authUserId).catch(() => undefined);
    return json(500, { error: "profile_create_failed" });
  }

  return json(200, { ok: true, username });
});
