import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().replace(/^@/, "").toLowerCase();
}

function usernameError(message: unknown) {
  const raw = String(message ?? "").toLowerCase();
  return raw.includes("already") || raw.includes("registered") || raw.includes("duplicate");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { ok: false, code: "method_not_allowed" });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization") || "";
    if (!url || !anon || !service || !authHeader) return reply(401, { ok: false, code: "unauthorized" });

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    const callerUser = userData?.user;
    if (userError || !callerUser) return reply(401, { ok: false, code: "unauthorized" });

    const body = await req.json();
    const appSessionId = String(body?.app_session_id || "");
    if (!appSessionId) return reply(401, { ok: false, code: "session_required" });

    const { data: current, error: accountError } = await admin
      .from("v21_accounts")
      .select("id,auth_user_id,username,display_name,role,avatar_path,locked_at,deleted_at")
      .eq("auth_user_id", callerUser.id)
      .maybeSingle();

    if (accountError || !current || current.deleted_at || current.locked_at) {
      return reply(403, { ok: false, code: "account_not_available" });
    }

    const { data: activeSession, error: sessionError } = await admin
      .from("v21_sessions")
      .select("app_session_id")
      .eq("app_session_id", appSessionId)
      .eq("account_id", current.id)
      .is("revoked_at", null)
      .maybeSingle();

    if (sessionError || !activeSession) return reply(401, { ok: false, code: "session_revoked" });

    const username = normalizeUsername(body?.username ?? current.username);
    const displayName = String(body?.display_name ?? current.display_name).trim();
    const password = body?.password ? String(body.password) : "";
    const hasAvatar = Object.prototype.hasOwnProperty.call(body || {}, "avatar_path");
    const avatarPath = hasAvatar ? (body.avatar_path ? String(body.avatar_path) : null) : current.avatar_path;

    if (!/^[a-z0-9_]{3,24}$/.test(username)) return reply(400, { ok: false, code: "invalid_username" });
    if (!displayName || displayName.length > 50) return reply(400, { ok: false, code: "invalid_display_name" });
    if (password && (password.length < 6 || password.length > 128)) {
      return reply(400, { ok: false, code: "invalid_password" });
    }

    const usernameChanged = username !== String(current.username || "").toLowerCase();
    if (usernameChanged) {
      const { data: existing } = await admin
        .from("v21_accounts")
        .select("id")
        .ilike("username", username)
        .neq("id", current.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing) return reply(409, { ok: false, code: "username_taken" });
    }

    const before = {
      username: current.username,
      display_name: current.display_name,
      avatar_path: current.avatar_path,
    };

    async function rollback() {
      await admin.from("v21_accounts").update(before).eq("id", current.id);
    }

    const { data: updatedRows, error: profileError } = await admin
      .from("v21_accounts")
      .update({ username, display_name: displayName, avatar_path: avatarPath })
      .eq("id", current.id)
      .select("id,username,display_name,role,avatar_path,locked_at,deleted_at,version,updated_at");

    if (profileError || !updatedRows?.[0]) {
      if (String(profileError?.code || "") === "23505") return reply(409, { ok: false, code: "username_taken" });
      return reply(400, { ok: false, code: "profile_update_failed" });
    }

    if (usernameChanged || password) {
      const patch: Record<string, unknown> = {};
      if (usernameChanged) {
        patch.email = `${username}@taphoa.chat`;
        patch.email_confirm = true;
        patch.user_metadata = {
          ...(callerUser.user_metadata || {}),
          username,
          display_name: displayName,
          app: "taphoa-chat-v21",
        };
      }
      if (password) patch.password = password;

      const { error: authUpdateError } = await admin.auth.admin.updateUserById(current.auth_user_id, patch);
      if (authUpdateError) {
        await rollback();
        if (usernameError(authUpdateError.message)) return reply(409, { ok: false, code: "username_taken" });
        if (password && String(authUpdateError.message || "").toLowerCase().includes("password")) {
          return reply(400, { ok: false, code: "invalid_password" });
        }
        return reply(400, { ok: false, code: "auth_update_failed" });
      }
    }

    const { data: finalAccount } = await admin
      .from("v21_accounts")
      .select("id,username,display_name,role,avatar_path,locked_at,deleted_at,version,updated_at")
      .eq("id", current.id)
      .maybeSingle();

    return reply(200, { ok: true, account: finalAccount || updatedRows[0] });
  } catch {
    return reply(400, { ok: false, code: "invalid_request" });
  }
});
