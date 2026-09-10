import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { ok: false, code: "method_not_allowed" });

  try {
    const body = await req.json();
    const username = String(body?.username ?? "").trim().replace(/^@/, "").toLowerCase();
    const displayName = String(body?.display_name ?? "").trim();
    const password = String(body?.password ?? "");

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return reply(400, { ok: false, code: "invalid_username" });
    }
    if (displayName.length < 1 || displayName.length > 50) {
      return reply(400, { ok: false, code: "invalid_display_name" });
    }
    if (password.length < 6 || password.length > 128) {
      return reply(400, { ok: false, code: "invalid_password" });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceRole) return reply(500, { ok: false, code: "server_config" });

    const admin = createClient(url, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existing } = await admin
      .from("v21_accounts")
      .select("id")
      .ilike("username", username)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) return reply(409, { ok: false, code: "username_taken" });

    const email = `${username}@taphoa.chat`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, display_name: displayName, app: "taphoa-chat-v21" },
    });

    if (createError || !created.user) {
      const msg = String(createError?.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered")) {
        return reply(409, { ok: false, code: "username_taken" });
      }
      return reply(400, { ok: false, code: "registration_failed" });
    }

    const { error: accountError } = await admin.from("v21_accounts").insert({
      auth_user_id: created.user.id,
      username,
      display_name: displayName,
      role: "user",
    });

    if (accountError) {
      await admin.auth.admin.deleteUser(created.user.id);
      if (String(accountError.code) === "23505") {
        return reply(409, { ok: false, code: "username_taken" });
      }
      return reply(500, { ok: false, code: "account_create_failed" });
    }

    return reply(200, { ok: true, login_username: username });
  } catch {
    return reply(400, { ok: false, code: "invalid_request" });
  }
});
