import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function errorCode(error: unknown) {
  const raw = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  if (raw.includes("admin_required")) return "admin_required";
  if (raw.includes("user_not_found")) return "user_not_found";
  if (raw.includes("zalo_not_found")) return "zalo_not_found";
  if (raw.includes("zalo_already_linked")) return "zalo_already_linked";
  return "zalo_update_failed";
}

async function loadAdminSnapshot(admin: ReturnType<typeof createClient>) {
  const [accountsResult, contactsResult, linksResult] = await Promise.all([
    admin.from("v21_accounts")
      .select("id,username,display_name,role,avatar_path,locked_at")
      .eq("role", "user")
      .is("deleted_at", null)
      .order("display_name", { ascending: true }),
    admin.from("zalo_contacts")
      .select("zalo_id,display_name,avatar_url,last_seen_at")
      .order("display_name", { ascending: true }),
    admin.from("zalo_user_links")
      .select("chat_account_id,zalo_id,linked_by_account_id,linked_at,updated_at")
      .order("linked_at", { ascending: false }),
  ]);

  const error = accountsResult.error || contactsResult.error || linksResult.error;
  if (error) throw error;
  return {
    accounts: accountsResult.data ?? [],
    contacts: contactsResult.data ?? [],
    links: linksResult.data ?? [],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { ok: false, code: "method_not_allowed" });

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!url || !anon || !service || !authHeader) {
      return reply(401, { ok: false, code: "unauthorized" });
    }

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
      .select("id,role,locked_at,deleted_at")
      .eq("auth_user_id", callerUser.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (callerError || !caller || caller.role !== "admin" || caller.locked_at) {
      return reply(403, { ok: false, code: "admin_required" });
    }

    const body = await req.json();
    const action = String(body?.action ?? "").trim().toLowerCase();

    if (action === "admin_snapshot") {
      const snapshot = await loadAdminSnapshot(admin);
      return reply(200, { ok: true, snapshot });
    }

    const targetId = String(body?.target_account_id ?? "").trim();
    if (!targetId) return reply(400, { ok: false, code: "target_required" });

    let rpcName = "";
    let params: Record<string, unknown> = {
      p_actor_account_id: caller.id,
      p_target_account_id: targetId,
    };

    if (action === "snapshot") {
      rpcName = "v21_zalo_admin_snapshot";
    } else if (action === "link") {
      const zaloId = String(body?.zalo_id ?? "").trim();
      if (!zaloId) return reply(400, { ok: false, code: "zalo_required" });
      rpcName = "v21_zalo_admin_link";
      params = { ...params, p_zalo_id: zaloId };
    } else if (action === "unlink") {
      rpcName = "v21_zalo_admin_unlink";
    } else {
      return reply(400, { ok: false, code: "invalid_action" });
    }

    const { data, error } = await admin.rpc(rpcName, params);
    if (error) {
      const code = errorCode(error);
      const status = code === "admin_required" ? 403 : code === "user_not_found" || code === "zalo_not_found" ? 404 : code === "zalo_already_linked" ? 409 : 400;
      return reply(status, { ok: false, code });
    }

    if (action === "snapshot") return reply(200, { ok: true, snapshot: data ?? null });
    if (action === "link") return reply(200, { ok: true, link: data ?? null });
    return reply(200, { ok: true });
  } catch {
    return reply(400, { ok: false, code: "invalid_request" });
  }
});
