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

    const { data: caller, error: callerError } = await admin
      .from("v21_accounts")
      .select("id,role,deleted_at,locked_at")
      .eq("auth_user_id", callerUser.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (callerError || !caller || caller.role !== "admin" || caller.locked_at) {
      return reply(403, { ok: false, code: "admin_required" });
    }

    const body = await req.json();
    const action = String(body?.action || "");
    const targetId = String(body?.target_account_id || "");
    if (!targetId) return reply(400, { ok: false, code: "target_required" });

    const { data: target, error: targetError } = await admin
      .from("v21_accounts")
      .select("id,auth_user_id,username,display_name,role,avatar_path,locked_at,deleted_at")
      .eq("id", targetId)
      .maybeSingle();

    if (targetError || !target || target.role !== "user" || target.deleted_at) {
      return reply(404, { ok: false, code: "user_not_found" });
    }

    async function revokeTargetSessions() {
      const { data: sessions } = await admin
        .from("v21_sessions")
        .select("app_session_id")
        .eq("account_id", targetId)
        .is("revoked_at", null);

      const now = new Date().toISOString();
      await admin
        .from("v21_sessions")
        .update({ revoked_at: now, last_seen_at: now })
        .eq("account_id", targetId)
        .is("revoked_at", null);

      const rows = (sessions || []).map((s: { app_session_id: string }) => ({
        account_id: targetId,
        target_app_session_id: s.app_session_id,
        kind: "revoked",
      }));
      if (rows.length) await admin.from("v21_session_events").insert(rows);
    }

    if (action === "save") {
      const username = normalizeUsername(body?.username ?? target.username);
      const displayName = String(body?.display_name ?? target.display_name).trim();
      const password = body?.password ? String(body.password) : "";
      const hasAvatar = Object.prototype.hasOwnProperty.call(body || {}, "avatar_path");
      const avatarPath = hasAvatar ? (body.avatar_path ? String(body.avatar_path) : null) : target.avatar_path;

      if (!/^[a-z0-9_]{3,24}$/.test(username)) return reply(400, { ok: false, code: "invalid_username" });
      if (!displayName || displayName.length > 50) return reply(400, { ok: false, code: "invalid_display_name" });
      if (password && (password.length < 6 || password.length > 128)) {
        return reply(400, { ok: false, code: "invalid_password" });
      }

      const usernameChanged = username !== String(target.username || "").toLowerCase();
      if (usernameChanged) {
        const { data: existing } = await admin
          .from("v21_accounts")
          .select("id")
          .ilike("username", username)
          .neq("id", targetId)
          .is("deleted_at", null)
          .maybeSingle();
        if (existing) return reply(409, { ok: false, code: "username_taken" });
      }

      const before = {
        username: target.username,
        display_name: target.display_name,
        avatar_path: target.avatar_path,
      };

      async function rollback() {
        await admin.from("v21_accounts").update(before).eq("id", targetId);
      }

      const { error: saveError } = await admin
        .from("v21_accounts")
        .update({ username, display_name: displayName, avatar_path: avatarPath })
        .eq("id", targetId);

      if (saveError) {
        if (String(saveError.code || "") === "23505") return reply(409, { ok: false, code: "username_taken" });
        return reply(400, { ok: false, code: "update_failed" });
      }

      if (usernameChanged || password) {
        const patch: Record<string, unknown> = {};
        if (usernameChanged) {
          const { data: targetAuth } = await admin.auth.admin.getUserById(target.auth_user_id);
          patch.email = `${username}@taphoa.chat`;
          patch.email_confirm = true;
          patch.user_metadata = {
            ...(targetAuth?.user?.user_metadata || {}),
            username,
            display_name: displayName,
            app: "taphoa-chat-v21",
          };
        }
        if (password) patch.password = password;

        const { error: authUpdateError } = await admin.auth.admin.updateUserById(target.auth_user_id, patch);
        if (authUpdateError) {
          await rollback();
          if (usernameError(authUpdateError.message)) return reply(409, { ok: false, code: "username_taken" });
          if (password && String(authUpdateError.message || "").toLowerCase().includes("password")) {
            return reply(400, { ok: false, code: "invalid_password" });
          }
          return reply(400, { ok: false, code: "auth_update_failed" });
        }
      }
    } else if (action === "lock") {
      const locked = Boolean(body?.locked);
      const { error } = await admin
        .from("v21_accounts")
        .update({ locked_at: locked ? new Date().toISOString() : null })
        .eq("id", targetId);
      if (error) return reply(400, { ok: false, code: "lock_update_failed" });
      if (locked) await revokeTargetSessions();
    } else if (action === "delete") {
      const now = new Date().toISOString();
      const { error } = await admin
        .from("v21_accounts")
        .update({ deleted_at: now, locked_at: now })
        .eq("id", targetId);
      if (error) return reply(400, { ok: false, code: "delete_failed" });
      await revokeTargetSessions();
    } else {
      return reply(400, { ok: false, code: "invalid_action" });
    }

    const { data: updated } = await admin
      .from("v21_accounts")
      .select("id,username,display_name,role,avatar_path,locked_at,deleted_at,version,updated_at")
      .eq("id", targetId)
      .maybeSingle();

    return reply(200, { ok: true, account: updated });
  } catch {
    return reply(400, { ok: false, code: "invalid_request" });
  }
});
