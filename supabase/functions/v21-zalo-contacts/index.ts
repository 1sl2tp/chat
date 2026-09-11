import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers });
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type Contact = { zalo_id: string; display_name: string; avatar_url: string | null };

function normalizeContacts(value: unknown): Contact[] | null {
  if (!Array.isArray(value) || value.length > 5000) return null;
  const out: Contact[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const input = item as Record<string, unknown>;
    const zaloId = String(input.zalo_id ?? "").trim();
    const displayName = String(input.display_name ?? "").trim();
    const avatarRaw = String(input.avatar_url ?? "").trim();
    if (!zaloId || !displayName) return null;
    out.push({ zalo_id: zaloId, display_name: displayName, avatar_url: avatarRaw || null });
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" });

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

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return reply(400, { ok: false, error: "invalid_json" });
  }

  const contacts = normalizeContacts(payload.contacts);
  if (contacts === null) return reply(400, { ok: false, error: "invalid_contacts" });
  if (contacts.length === 0) return reply(200, { ok: true, count: 0 });

  const now = new Date().toISOString();
  const rows = contacts.map((contact) => ({ ...contact, updated_at: now }));
  const { error } = await admin.from("zalo_contacts").upsert(rows, { onConflict: "zalo_id" });
  if (error) return reply(500, { ok: false, error: "contact_upsert_failed" });

  return reply(200, { ok: true, count: rows.length });
});
