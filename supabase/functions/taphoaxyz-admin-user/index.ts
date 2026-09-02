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
  return (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
}

function normalizeUsername(value: unknown): string {
  return String(value || "").trim().replace(/^@+/, "").toLowerCase();
}

function normalizeDisplayName(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim();
}

function validProfileId(value: unknown): string {
  const id = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : "";
}

function validateAccount(displayNameValue: unknown, usernameValue: unknown, passwordValue?: unknown) {
  const username = normalizeUsername(usernameValue);
  const displayName = normalizeDisplayName(displayNameValue, username);
  const password = passwordValue === undefined ? undefined : String(passwordValue || "");
  if (displayName.length < 1 || displayName.length > 50) throw new Error("invalid_display_name");
  if (username === "admin") throw new Error("reserved_username");
  if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error("invalid_username");
  if (password !== undefined && (password.length < 6 || password.length > 128)) throw new Error("invalid_password");
  return { displayName, username, password };
}

function clientError(error: unknown): Response {
  const code = error instanceof Error ? error.message : String(error || "operation_failed");
  const status = /taken|exists|reserved/.test(code) ? 409 : /not_found/.test(code) ? 404 : 400;
  return json(status, { error: code });
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
    .is("deleted_at", null)
    .maybeSingle();
  if (adminResult.error || !adminResult.data?.id) return json(403, { error: "admin_required" });
  const adminProfileId = String(adminResult.data.id);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const action = String(body.action || "");
  try {
    if (action === "create_user2") {
      const account = validateAccount(body.displayName, body.username, body.password);
      const existingProfile = await service.from("chat_profiles").select("id").eq("username", account.username).is("deleted_at", null).maybeSingle();
      if (existingProfile.error) return json(500, { error: "profile_lookup_failed" });
      if (existingProfile.data) return json(409, { error: "username_exists" });

      const email = `${account.username}@taphoa.chat`;
      const created = await service.auth.admin.createUser({
        email,
        password: account.password!,
        email_confirm: true,
        user_metadata: { username: account.username, display_name: account.displayName },
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
        display_name: account.displayName,
        username: account.username,
        user_level: 2,
        is_admin: false,
      });
      if (profileInsert.error) {
        await service.auth.admin.deleteUser(authUserId).catch(() => undefined);
        return json(500, { error: "profile_create_failed" });
      }
      return json(200, { ok: true, displayName: account.displayName, username: account.username });
    }

    const profileId = validProfileId(body.profileId);
    if (!profileId) return json(400, { error: "invalid_profile_id" });

    if (action === "upgrade_guest") {
      const account = validateAccount(body.displayName, body.username, body.password);
      const result = await service.rpc("chat_admin_upgrade_guest", {
        p_admin_profile_id: adminProfileId,
        p_profile_id: profileId,
        p_display_name: account.displayName,
        p_username: account.username,
        p_password: account.password!,
      });
      if (result.error) return clientError(result.error.message);
      return json(200, { ok: true, ...(result.data as Record<string, unknown>) });
    }

    if (action === "update_user2") {
      const account = validateAccount(body.displayName, body.username);
      const result = await service.rpc("chat_admin_update_user2", {
        p_admin_profile_id: adminProfileId,
        p_profile_id: profileId,
        p_display_name: account.displayName,
        p_username: account.username,
      });
      if (result.error) return clientError(result.error.message);
      return json(200, { ok: true, ...(result.data as Record<string, unknown>) });
    }

    if (action === "reset_password") {
      const password = String(body.password || "");
      if (password.length < 6 || password.length > 128) return json(400, { error: "invalid_password" });
      const result = await service.rpc("chat_admin_reset_user2_password", {
        p_admin_profile_id: adminProfileId,
        p_profile_id: profileId,
        p_password: password,
      });
      if (result.error) return clientError(result.error.message);
      return json(200, { ok: true });
    }

    if (action === "delete_user") {
      const result = await service.rpc("chat_admin_soft_delete_user", {
        p_admin_profile_id: adminProfileId,
        p_profile_id: profileId,
      });
      if (result.error) return clientError(result.error.message);
      return json(200, { ok: true });
    }

    return json(400, { error: "invalid_action" });
  } catch (error) {
    return clientError(error);
  }
});
