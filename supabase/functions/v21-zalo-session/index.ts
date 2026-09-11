import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validCredentials(value: unknown): value is { cookie: unknown[]; imei: string; userAgent: string } {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return Array.isArray(input.cookie) && input.cookie.length > 0 && typeof input.imei === "string" && !!input.imei && typeof input.userAgent === "string" && !!input.userAgent;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return reply(500, { ok: false, error: "server_config_missing" });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const bridgeToken = req.headers.get("x-bridge-token") ?? "";
  if (!bridgeToken) return reply(401, { ok: false, error: "unauthorized" });
  const tokenHash = await sha256Hex(bridgeToken);
  const { data: authRow, error: authError } = await admin
    .from("v21_zalo_bridge_auth")
    .select("token_sha256")
    .eq("id", "primary")
    .maybeSingle();
  if (authError) return reply(500, { ok: false, error: "auth_lookup_failed" });
  if (!authRow || authRow.token_sha256 !== tokenHash) return reply(403, { ok: false, error: "unauthorized" });

  if (req.method === "GET") {
    const { data, error } = await admin
      .from("v21_zalo_bridge_session")
      .select("credentials")
      .eq("id", "primary")
      .maybeSingle();
    if (error) return reply(500, { ok: false, error: "session_load_failed" });
    return reply(200, { ok: true, credentials: data?.credentials ?? null });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return reply(400, { ok: false, error: "invalid_json" });
  }
  if (!validCredentials(payload.credentials)) return reply(400, { ok: false, error: "invalid_credentials" });

  const { error } = await admin
    .from("v21_zalo_bridge_session")
    .upsert({ id: "primary", credentials: payload.credentials, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return reply(500, { ok: false, error: "session_save_failed" });
  return reply(200, { ok: true });
});
