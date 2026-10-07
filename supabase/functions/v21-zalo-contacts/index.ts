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

const BRIDGE_AUTH_CACHE_MS = 15 * 60_000;
let cachedBridgeTokenHash = "";
let cachedBridgeAuthAt = 0;

const AVATAR_BUCKET = "v21-avatars";
const AVATAR_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function avatarSourceIdentity(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return raw.split(/[?#]/, 1)[0];
  }
}

async function mirrorZaloAvatar(
  admin: ReturnType<typeof createClient>,
  accountId: string,
  sourceUrl: string,
  currentPath: string | null = null,
) {
  const raw = String(sourceUrl ?? "").trim();
  if (!raw) return null;
  const identity = avatarSourceIdentity(raw);
  const digest = (await sha256Hex(identity)).slice(0, 32);
  const prefix = `zalo/${accountId}/${digest}.`;
  const current = String(currentPath ?? "").trim();
  if (current.startsWith(prefix)) return current;

  const response = await fetch(raw, { redirect: "follow" });
  if (!response.ok) throw new Error(`avatar_fetch_${response.status}`);
  let contentType = String(response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType === "image/jpg") contentType = "image/jpeg";
  const ext = AVATAR_MIME_EXT[contentType];
  if (!ext) throw new Error("avatar_type_unsupported");
  const sourceBlob = await response.blob();
  if (sourceBlob.size < 1 || sourceBlob.size > 2 * 1024 * 1024) throw new Error("avatar_size_invalid");
  const blob = sourceBlob.type === contentType
    ? sourceBlob
    : new Blob([await sourceBlob.arrayBuffer()], { type: contentType });

  const storagePath = `zalo/${accountId}/${digest}.${ext}`;
  const { error: uploadError } = await admin.storage.from(AVATAR_BUCKET).upload(storagePath, blob, {
    contentType,
    cacheControl: "31536000",
    upsert: true,
  });
  if (uploadError) throw uploadError;

  if (current.startsWith(`zalo/${accountId}/`) && current !== storagePath) {
    await admin.storage.from(AVATAR_BUCKET).remove([current]).catch(() => null);
  }
  return storagePath;
}

type ThreadType = "user" | "group";
type Contact = {
  zalo_id: string;
  display_name: string;
  alias_name?: string | null;
  avatar_url: string | null;
  thread_type: ThreadType;
};
type StoredContact = {
  zalo_id: string;
  display_name: string;
  profile_name: string;
  alias_name: string | null;
  avatar_url: string | null;
  thread_type: ThreadType;
};

function normalizeContacts(value: unknown): Contact[] | null {
  if (!Array.isArray(value) || value.length > 5000) return null;
  const out: Contact[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const input = item as Record<string, unknown>;
    const zaloId = String(input.zalo_id ?? "").trim();
    const displayName = String(input.display_name ?? "").trim();
    const avatarRaw = String(input.avatar_url ?? "").trim();
    const threadTypeRaw = String(input.thread_type ?? "user").trim().toLowerCase();
    if (!zaloId || !displayName || !["user", "group"].includes(threadTypeRaw)) return null;
    const contact: Contact = {
      zalo_id: zaloId,
      display_name: displayName,
      avatar_url: avatarRaw || null,
      thread_type: threadTypeRaw as ThreadType,
    };
    if (Object.prototype.hasOwnProperty.call(input, "alias_name")) {
      const aliasName = String(input.alias_name ?? "").trim();
      contact.alias_name = aliasName || null;
    }
    out.push(contact);
  }
  return out;
}

async function syncLinkedAccountAvatars(
  admin: ReturnType<typeof createClient>,
  contacts: Contact[],
) {
  const sources = new Map(
    contacts
      .filter((contact) => contact.avatar_url)
      .map((contact) => [contact.zalo_id, String(contact.avatar_url)]),
  );
  const zaloIds = [...sources.keys()];
  if (!zaloIds.length) return 0;

  const links: Array<{ chat_account_id: string; zalo_id: string }> = [];
  for (let offset = 0; offset < zaloIds.length; offset += 200) {
    const chunk = zaloIds.slice(offset, offset + 200);
    const { data, error } = await admin.from("zalo_user_links")
      .select("chat_account_id,zalo_id")
      .in("zalo_id", chunk);
    if (error) throw error;
    links.push(...((data ?? []) as Array<{ chat_account_id: string; zalo_id: string }>));
  }
  if (!links.length) return 0;

  const accountIds = [...new Set(links.map((link) => String(link.chat_account_id)))];
  const { data: accounts, error: accountError } = await admin.from("v21_accounts")
    .select("id,avatar_path")
    .in("id", accountIds)
    .is("deleted_at", null);
  if (accountError) throw accountError;
  const accountById = new Map((accounts ?? []).map((row) => [String(row.id), row]));

  let mirrored = 0;
  for (const link of links) {
    const accountId = String(link.chat_account_id);
    const account = accountById.get(accountId);
    const sourceUrl = sources.get(String(link.zalo_id)) ?? "";
    if (!account || !sourceUrl) continue;
    const current = String(account.avatar_path ?? "").trim();
    const isLegacyExternal = /^https?:\/\//i.test(current);
    const isManaged = current.startsWith(`zalo/${accountId}/`);
    if (current && !isLegacyExternal && !isManaged) continue;

    try {
      const storagePath = await mirrorZaloAvatar(admin, accountId, sourceUrl, current || null);
      if (!storagePath || storagePath === current) continue;
      const { error } = await admin.from("v21_accounts")
        .update({ avatar_path: storagePath })
        .eq("id", accountId)
        .is("deleted_at", null);
      if (!error) mirrored += 1;
    } catch {
      // Keep the contact sync healthy even when one remote avatar is unavailable.
    }
  }
  return mirrored;
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
  const configuredBridgeToken = String(Deno.env.get("ZALO_BRIDGE_TOKEN") ?? "").trim();
  if (configuredBridgeToken) {
    const configuredHash = await sha256Hex(configuredBridgeToken);
    if (configuredHash !== tokenHash) return reply(403, { ok: false, error: "unauthorized" });
  } else {
    const now = Date.now();
    const cachedAuthorized =
      cachedBridgeTokenHash === tokenHash &&
      now - cachedBridgeAuthAt < BRIDGE_AUTH_CACHE_MS;
    if (!cachedAuthorized) {
      const { data: authRow, error: authError } = await admin
        .from("v21_zalo_bridge_auth")
        .select("token_sha256")
        .eq("id", "primary")
        .maybeSingle();
      if (authError) return reply(500, { ok: false, error: "auth_lookup_failed" });
      if (!authRow || authRow.token_sha256 !== tokenHash) return reply(403, { ok: false, error: "unauthorized" });
      cachedBridgeTokenHash = tokenHash;
      cachedBridgeAuthAt = now;
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return reply(400, { ok: false, error: "invalid_json" });
  }

  const aliasSnapshotComplete = payload.alias_snapshot_complete === true;
  const contacts = normalizeContacts(payload.contacts);
  if (contacts === null) return reply(400, { ok: false, error: "invalid_contacts" });
  if (contacts.length === 0) return reply(200, { ok: true, count: 0 });

  const existingById = new Map<string, StoredContact>();
  const ids = contacts.map((contact) => contact.zalo_id);
  for (let offset = 0; offset < ids.length; offset += 200) {
    const chunk = ids.slice(offset, offset + 200);
    const { data: existing, error: existingError } = await admin
      .from("zalo_contacts")
      .select("zalo_id,display_name,profile_name,alias_name,avatar_url,thread_type")
      .in("zalo_id", chunk);
    if (existingError) return reply(500, { ok: false, error: "contact_lookup_failed" });
    for (const row of existing ?? []) {
      existingById.set(String(row.zalo_id), {
        zalo_id: String(row.zalo_id),
        display_name: String(row.display_name ?? ""),
        profile_name: String(row.profile_name ?? row.display_name ?? ""),
        alias_name: row.alias_name == null ? null : String(row.alias_name),
        avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
        thread_type: String(row.thread_type ?? "user").toLowerCase() === "group" ? "group" : "user",
      });
    }
  }

  const desiredContacts: StoredContact[] = contacts.map((contact) => {
    const existing = existingById.get(contact.zalo_id);
    const profileName = contact.display_name;
    const canReplaceAlias = aliasSnapshotComplete && contact.thread_type === "user";
    const aliasName = canReplaceAlias
      ? (String(contact.alias_name ?? "").trim() || null)
      : (existing?.alias_name ?? null);
    const effectiveName = canReplaceAlias
      ? (aliasName || profileName)
      : (existing?.display_name || profileName);
    return {
      zalo_id: contact.zalo_id,
      display_name: effectiveName,
      profile_name: profileName,
      alias_name: aliasName,
      avatar_url: contact.avatar_url,
      thread_type: contact.thread_type,
    };
  });

  const now = new Date().toISOString();
  const rows = desiredContacts
    .filter((contact) => {
      const existing = existingById.get(contact.zalo_id);
      return !existing ||
        existing.display_name !== contact.display_name ||
        existing.profile_name !== contact.profile_name ||
        String(existing.alias_name ?? "") !== String(contact.alias_name ?? "") ||
        String(existing.avatar_url ?? "") !== String(contact.avatar_url ?? "") ||
        existing.thread_type !== contact.thread_type;
    })
    .map((contact) => ({ ...contact, updated_at: now }));
  if (rows.length) {
    const { error } = await admin.from("zalo_contacts").upsert(rows, { onConflict: "zalo_id" });
    if (error) return reply(500, { ok: false, error: "contact_upsert_failed" });
  }

  let avatarsMirrored = 0;
  try {
    avatarsMirrored = await syncLinkedAccountAvatars(admin, contacts);
  } catch {
    avatarsMirrored = 0;
  }

  return reply(200, { ok: true, count: contacts.length, changed: rows.length, avatars_mirrored: avatarsMirrored });
});
