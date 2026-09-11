# Zalo & Chat Account Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Admin-only **Zalo & tài khoản** Settings surface that shows Chat users, Zalo contacts, and their one-to-one links, and lets Admin link/unlink existing users or create a new Chat user from an unlinked Zalo contact.

**Architecture:** Keep Supabase as the only source of truth. Extend the existing `v21-zalo-admin` Edge Function with `admin_snapshot` and `create_and_link`; keep existing `snapshot/link/unlink` behavior unchanged. Add a separate browser module for the Settings surface while preserving the current per-profile picker. Render remains transport-only and is not touched in this phase.

**Tech Stack:** Static HTML/JS PWA, Supabase Auth/Postgres/Edge Functions, Python/pytest contract tests, existing canonical preview builder/verify tooling.

**Spec:** `docs/superpowers/specs/2026-09-11-zalo-account-admin-design.md`

## Global Constraints

- Supabase remains canonical for `v21_accounts`, `zalo_contacts`, `zalo_user_links`, and message routing.
- Render does not store or manage Chat↔Zalo mappings and receives no account-admin responsibility.
- One Chat User ↔ one Zalo identity; existing unique constraints remain authoritative.
- Existing `snapshot`, `link`, and `unlink` actions in `v21-zalo-admin` must remain compatible with `zalo-admin-link.js`.
- Existing `Cha yêu` mapping must not be recreated, migrated, or overwritten during deployment.
- Passwords are write-only to Supabase Auth and must never appear in snapshots, logs, returned account payloads, app tables, or Google Sheet data.
- Existing Chat account avatar must not be silently replaced when linking; avatar adoption for an existing account is explicit only.
- A newly created Chat account may use the Zalo avatar URL directly as initial `avatar_path` when `use_zalo_avatar=true`.
- Do not download/re-upload avatar files in this phase.
- Do not implement image/file/voice transport or call events in this phase.
- Do not add Zalo transport logic to `v21-sync-engine.js`.
- `index.source.html` is canonical; regenerate `index.html` and `version.json` with `python tools/build_current_preview.py`.
- `python tools/verify_current.py`, Zalo Bridge TDD, and existing profile-link behavior must remain green.

---

## File Structure

**Create**
- `tests/test_v21_zalo_account_admin_contract.py` — backend action/security/rollback/password contract.
- `zalo-account-admin.js` — Admin Settings controller and rendering logic.
- `zalo-account-admin.css` — responsive table/card presentation and create/link form styles.

**Modify**
- `supabase/functions/v21-zalo-admin/index.ts` — add `admin_snapshot` and `create_and_link` while preserving per-profile actions.
- `tests/test_v21_zalo_admin_ui_contract.py` — add Settings-surface build and copy/status contract while retaining profile-picker checks.
- `.github/workflows/zalo-bridge-tdd.yml` — run the new account-admin contract test.
- `index.source.html` — include new CSS/JS build sources and expose one Admin Settings mount point/action using the existing shell pattern.
- `tools/verify_current.py` — syntax-check the new JS module and run the new contract test.

**Generated**
- `index.html`
- `version.json`

No new database migration is required for this phase: production already has `v21_accounts`, `zalo_contacts`, `zalo_user_links`, and the canonical `v21_zalo_admin_link/unlink` RPCs. `v21_accounts` already enforces `^[a-z0-9_]{3,24}$`, display-name length 1–50, unique active username, and `auth_user_id → auth.users ON DELETE CASCADE`.

---

### Task 1: Lock the expanded Admin API contract

**Files:**
- Create: `tests/test_v21_zalo_account_admin_contract.py`
- Modify: `.github/workflows/zalo-bridge-tdd.yml`

**Interfaces:**
- Requires actions `admin_snapshot` and `create_and_link` in `v21-zalo-admin`.
- Requires server-side Auth calls `auth.admin.createUser` and compensating `auth.admin.deleteUser` on failure.
- Requires account insert into `v21_accounts` and canonical mapping through `v21_zalo_admin_link`.
- Forbids password from any response projection.

- [ ] **Step 1: Write the failing contract test**

```python
from pathlib import Path

ROOT = Path(__file__).parents[1]
EDGE = (ROOT / "supabase/functions/v21-zalo-admin/index.ts").read_text("utf-8")


def test_zalo_account_admin_backend_contract():
    lower = EDGE.lower()
    for token in [
        'action === "admin_snapshot"',
        'action === "create_and_link"',
        'auth.admin.createuser',
        'auth.admin.deleteuser',
        '.from("zalo_contacts")',
        '.from("zalo_user_links")',
        '.from("v21_accounts")',
        'v21_zalo_admin_link',
        'username_taken',
        'invalid_username',
        'invalid_display_name',
        'invalid_password',
        'zalo_already_linked',
    ]:
        assert token in lower, token

    assert 'select("id,username,display_name,role,avatar_path,locked_at")' in lower
    assert 'password:' not in lower.split('return reply(200')[-1]


def test_existing_profile_actions_are_preserved():
    lower = EDGE.lower()
    for token in ['action === "snapshot"', 'action === "link"', 'action === "unlink"']:
        assert token in lower, token
```

- [ ] **Step 2: Run RED**

Run: `python -m pytest -q tests/test_v21_zalo_account_admin_contract.py`

Expected: FAIL because `admin_snapshot` and `create_and_link` are not implemented.

- [ ] **Step 3: Add the test to Zalo Bridge TDD**

Add after the existing schema contract:

```yaml
      - name: Zalo account admin contract
        run: python -m pytest -q tests/test_v21_zalo_account_admin_contract.py
```

- [ ] **Step 4: Commit RED contract**

```bash
git add tests/test_v21_zalo_account_admin_contract.py .github/workflows/zalo-bridge-tdd.yml
git commit -m "test(zalo): require account admin settings backend"
```

---

### Task 2: Add `admin_snapshot` without changing mapping ownership

**Files:**
- Modify: `supabase/functions/v21-zalo-admin/index.ts`
- Test: `tests/test_v21_zalo_account_admin_contract.py`

**Interfaces:**
- Input: `{action:"admin_snapshot"}`; no `target_account_id` required.
- Output: `{ok:true,snapshot:{accounts,contacts,links}}`.
- `accounts`: active `role='user'` Chat accounts only.
- `contacts`: canonical Zalo contact rows only.
- `links`: canonical mapping rows only.

- [ ] **Step 1: Move target validation below action dispatch**

The current function requires `target_account_id` before knowing the action. Change the flow so only `snapshot/link/unlink` require a target. `admin_snapshot` and `create_and_link` must not.

- [ ] **Step 2: Implement server-side snapshot queries**

Use service-role queries after the existing Admin caller check:

```ts
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
```

Dispatch before per-target RPC logic:

```ts
if (action === "admin_snapshot") {
  const snapshot = await loadAdminSnapshot(admin);
  return reply(200, { ok: true, snapshot });
}
```

- [ ] **Step 3: Verify account snapshot never contains Auth IDs/passwords**

Do not select `auth_user_id`. Do not include email. Do not copy the request body into logs or response objects.

- [ ] **Step 4: Run GREEN for snapshot portion**

Run: `python -m pytest -q tests/test_v21_zalo_account_admin_contract.py tests/test_v21_zalo_schema_contract.py`

Expected: the test may still fail only on `create_and_link` tokens; existing profile/schema tests stay PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/v21-zalo-admin/index.ts
git commit -m "feat(zalo): add canonical admin mapping snapshot"
```

---

### Task 3: Implement server-side `create_and_link` with compensation

**Files:**
- Modify: `supabase/functions/v21-zalo-admin/index.ts`
- Test: `tests/test_v21_zalo_account_admin_contract.py`

**Interfaces:**
- Input: `{action:"create_and_link",zalo_id,username,display_name,password,use_zalo_avatar}`.
- Output: `{ok:true,account:{id,username,display_name,role,avatar_path,locked_at},link}`.
- Uses existing `v21_zalo_admin_link` RPC for mapping semantics.
- On any failure after Auth creation, removes the new Chat account/Auth user so no Chat orphan remains.

- [ ] **Step 1: Add validation helpers matching existing account admin**

```ts
function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().replace(/^@/, "").toLowerCase();
}

function usernameError(message: unknown) {
  const raw = String(message ?? "").toLowerCase();
  return raw.includes("already") || raw.includes("registered") || raw.includes("duplicate");
}
```

Validate exactly:

```ts
if (!/^[a-z0-9_]{3,24}$/.test(username)) return reply(400,{ok:false,code:"invalid_username"});
if (!displayName || displayName.length > 50) return reply(400,{ok:false,code:"invalid_display_name"});
if (password.length < 6 || password.length > 128) return reply(400,{ok:false,code:"invalid_password"});
```

- [ ] **Step 2: Reject unavailable Zalo and duplicate username before creating Auth**

```ts
const { data: contact } = await admin.from("zalo_contacts")
  .select("zalo_id,display_name,avatar_url")
  .eq("zalo_id", zaloId)
  .maybeSingle();
if (!contact) return reply(404,{ok:false,code:"zalo_not_found"});

const { data: existingLink } = await admin.from("zalo_user_links")
  .select("chat_account_id")
  .eq("zalo_id", zaloId)
  .maybeSingle();
if (existingLink) return reply(409,{ok:false,code:"zalo_already_linked"});

const { data: existingAccount } = await admin.from("v21_accounts")
  .select("id")
  .ilike("username", username)
  .is("deleted_at", null)
  .maybeSingle();
if (existingAccount) return reply(409,{ok:false,code:"username_taken"});
```

- [ ] **Step 3: Create Auth user and Chat account**

```ts
const { data: createdAuth, error: authError } = await admin.auth.admin.createUser({
  email: `${username}@taphoa.chat`,
  password,
  email_confirm: true,
  user_metadata: { username, display_name: displayName, app: "taphoa-chat-v21" },
});
if (authError || !createdAuth.user) {
  if (usernameError(authError?.message)) return reply(409,{ok:false,code:"username_taken"});
  return reply(400,{ok:false,code:"auth_create_failed"});
}

const avatarPath = useZaloAvatar && contact.avatar_url ? String(contact.avatar_url) : null;
const { data: account, error: accountError } = await admin.from("v21_accounts")
  .insert({
    auth_user_id: createdAuth.user.id,
    username,
    display_name: displayName,
    role: "user",
    avatar_path: avatarPath,
  })
  .select("id,username,display_name,role,avatar_path,locked_at")
  .single();
```

- [ ] **Step 4: Add compensating cleanup**

Create one local helper after Auth creation:

```ts
async function cleanupCreatedAccount(accountId: string | null, authUserId: string) {
  if (accountId) await admin.from("v21_accounts").delete().eq("id", accountId);
  await admin.auth.admin.deleteUser(authUserId);
}
```

If account insert fails, call cleanup with `null`. If mapping RPC fails, call cleanup with the inserted `account.id`.

- [ ] **Step 5: Link using the existing canonical RPC**

```ts
const { data: link, error: linkError } = await admin.rpc("v21_zalo_admin_link", {
  p_actor_account_id: caller.id,
  p_target_account_id: account.id,
  p_zalo_id: zaloId,
});
if (linkError) {
  await cleanupCreatedAccount(account.id, createdAuth.user.id);
  const code = errorCode(linkError);
  return reply(code === "zalo_already_linked" ? 409 : 400, { ok:false, code });
}
return reply(200,{ok:true,account,link});
```

No password is placed in `account`, `link`, `snapshot`, logging, or any app table.

- [ ] **Step 6: Run full backend contracts GREEN**

Run: `python -m pytest -q tests/test_v21_zalo_account_admin_contract.py tests/test_v21_zalo_schema_contract.py`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/v21-zalo-admin/index.ts
git commit -m "feat(zalo): create and link Chat accounts safely"
```

---

### Task 4: Build the Admin Settings controller and four-state model

**Files:**
- Create: `zalo-account-admin.js`
- Create: `zalo-account-admin.css`
- Modify: `tests/test_v21_zalo_admin_ui_contract.py`

**Interfaces:**
- Uses `window.V21AuthSessionStore.getClient()` and normal browser JWT only.
- Calls `v21-zalo-admin` actions: `admin_snapshot`, `link`, `unlink`, `create_and_link`.
- Produces `window.V21ZaloAccountAdmin = { mount, refresh, open, close }`.
- Does not write Supabase tables directly and does not touch SyncEngine.

- [ ] **Step 1: Extend UI contract test and verify RED**

Add checks:

```python
def test_zalo_account_admin_settings_surface():
    module = (ROOT / "zalo-account-admin.js").read_text("utf-8")
    css = (ROOT / "zalo-account-admin.css").read_text("utf-8")
    source = (ROOT / "index.source.html").read_text("utf-8")
    for token in [
        "V21ZaloAccountAdmin",
        "Zalo & tài khoản",
        "admin_snapshot",
        "create_and_link",
        "Đã kết nối",
        "Chưa kết nối",
        "Zalo đã được gán",
        "Chưa có tài khoản Chat",
        "Tạo tài khoản",
        "Chọn Zalo",
        "Bỏ liên kết",
    ]:
        assert token in module, token
    assert 'data-build-source="zalo-account-admin.css"' in source
    assert 'data-build-source="zalo-account-admin.js"' in source
    assert "@media" in css and "max-width" in css
```

Run: `python -m pytest -q tests/test_v21_zalo_admin_ui_contract.py`

Expected: FAIL because new files/build sources do not exist.

- [ ] **Step 2: Implement API wrapper and normalized view model**

```js
async function invoke(body){
  const store=window.V21AuthSessionStore;
  const snap=store?.snapshot?.()||{};
  if(snap.state!=='AUTHENTICATED'||snap.account?.role!=='admin')throw new Error('admin_required');
  const client=store.getClient?.();
  const {data,error}=await client.functions.invoke('v21-zalo-admin',{body});
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.code||'zalo_update_failed');
  return data;
}
```

Normalize by `chat_account_id` and `zalo_id`, but never persist a second copy outside the current in-memory snapshot.

Rows shown to Admin:
- every Chat User once: linked → `Đã kết nối`; unlinked → `Chưa kết nối`;
- every unlinked Zalo contact once: `Chưa có tài khoản Chat`;
- in pickers, contacts linked to another account are disabled as `Zalo đã được gán`.

- [ ] **Step 3: Implement existing-user link/unlink flows**

For `Chọn Zalo` / `Đổi`, render a search input and contact buttons. After mutation always call `refresh()` from `admin_snapshot`; do not patch the local snapshot optimistically.

```js
await invoke({action:'link',target_account_id:accountId,zalo_id:zaloId});
await refresh();
```

```js
await invoke({action:'unlink',target_account_id:accountId});
await refresh();
```

- [ ] **Step 4: Implement Zalo-only `Tạo tài khoản` form**

Fields:
- username, required;
- display name, prefilled from contact name;
- password, required, `autocomplete="new-password"`;
- `use_zalo_avatar`, checked by default only when `avatar_url` exists.

Submit exactly:

```js
await invoke({
  action:'create_and_link',
  zalo_id:contact.zalo_id,
  username:username.value.trim().replace(/^@/,'').toLowerCase(),
  display_name:displayName.value.trim(),
  password:password.value,
  use_zalo_avatar:useAvatar.checked,
});
password.value='';
await refresh();
```

Password must not be copied to dataset attributes, stored module state, localStorage/sessionStorage, logs, or rendered error text.

- [ ] **Step 5: Map errors to user-facing Vietnamese copy**

```js
const ERRORS={
  invalid_username:'Tên đăng nhập chỉ gồm a-z, 0-9, gạch dưới; dài 3–24 ký tự',
  username_taken:'Tên đăng nhập đã được dùng',
  invalid_display_name:'Tên hiển thị không hợp lệ',
  invalid_password:'Mật khẩu cần từ 6 đến 128 ký tự',
  zalo_not_found:'Không tìm thấy tài khoản Zalo',
  zalo_already_linked:'Tài khoản Zalo này đã được gán',
  user_not_found:'Không tìm thấy User Chat',
  admin_required:'Bạn không có quyền thực hiện',
  unauthorized:'Bạn không có quyền thực hiện',
};
```

- [ ] **Step 6: Implement responsive CSS**

Desktop ≥760px: grid/table rhythm with conceptual columns `Chat User | Zalo | Avatar | Trạng thái | Hành động`.

Mobile <760px: each relationship becomes one stacked card; no horizontal overflow. Keep controls ≥36px tall and use the same theme variables as `zalo-admin-link.css`.

- [ ] **Step 7: Commit module + RED build-source expectation**

```bash
git add zalo-account-admin.js zalo-account-admin.css tests/test_v21_zalo_admin_ui_contract.py
git commit -m "feat(zalo): add account mapping admin settings module"
```

---

### Task 5: Wire the Settings surface into canonical source

**Files:**
- Modify: `index.source.html`
- Modify: `tools/verify_current.py`
- Generated: `index.html`, `version.json`

**Interfaces:**
- Include `zalo-account-admin.css` near existing `zalo-admin-link.css`.
- Include `zalo-account-admin.js` near existing `zalo-admin-link.js` after Auth/session code is available.
- Mount/open control is Admin-only; non-Admin should not see the Settings entry.

- [ ] **Step 1: Add canonical build sources**

```html
<link rel="stylesheet" href="./zalo-account-admin.css" data-build-source="zalo-account-admin.css">
...
<script src="./zalo-account-admin.js" data-build-source="zalo-account-admin.js"></script>
```

- [ ] **Step 2: Add one Admin Settings entry**

Use the existing account/profile/settings action area rather than adding a new permanent global nav rail. The visible label is exactly `Zalo & tài khoản`. Give the mount target `data-zalo-account-admin-host` and open button `data-zalo-account-admin-open` so the module can attach without editing Chat message/composer code.

The module itself checks current Auth role before rendering; the shell markup must also hide the entry for non-Admin using the same Admin visibility mechanism already used by `data-profile-admin-actions`.

- [ ] **Step 3: Extend canonical verifier**

Add `zalo-account-admin.js` to the `node --check` file list and run the new pytest contract:

```python
subprocess.run([sys.executable,'-m','pytest','-q',str(ROOT/'tests'/'test_v21_zalo_account_admin_contract.py')],check=True,cwd=ROOT)
```

- [ ] **Step 4: Build generated artifacts**

Run: `python tools/build_current_preview.py`

Expected: `index.html` and `version.json` regenerated from `index.source.html` and new CSS/JS modules.

- [ ] **Step 5: Run UI contracts GREEN**

Run: `python -m pytest -q tests/test_v21_zalo_admin_ui_contract.py tests/test_v21_zalo_account_admin_contract.py`

Expected: PASS.

- [ ] **Step 6: Run canonical verifier**

Run: `python tools/verify_current.py`

Expected: PASS and `index.html is synchronized with modular source` check succeeds.

- [ ] **Step 7: Commit**

```bash
git add index.source.html index.html version.json tools/verify_current.py zalo-account-admin.js zalo-account-admin.css tests/test_v21_zalo_admin_ui_contract.py tests/test_v21_zalo_account_admin_contract.py
git commit -m "feat(chat): wire Zalo account admin settings"
```

---

### Task 6: Regression-check profile picker, messaging isolation, and CI

**Files:**
- Modify only if tests reveal a real regression.

**Interfaces:**
- Existing `zalo-admin-link.js` still calls per-user `snapshot/link/unlink` unchanged.
- `v21-sync-engine.js` still contains no Zalo transport logic.
- Existing text bridge remains independent of Admin Settings UI.

- [ ] **Step 1: Run Zalo contracts**

```bash
python -m pytest -q \
  tests/test_v21_zalo_schema_contract.py \
  tests/test_v21_zalo_account_admin_contract.py \
  tests/test_v21_zalo_admin_ui_contract.py
```

Expected: all PASS.

- [ ] **Step 2: Run bridge unit suite**

Run: `cd bridge/zalo && npm test`

Expected: PASS.

- [ ] **Step 3: Run full canonical V21 verification**

Run: `python tools/verify_current.py`

Expected: PASS.

- [ ] **Step 4: Verify CI on the exact feature SHA**

Wait for both PR workflows on the current head:
- `Zalo Bridge TDD` → success;
- `Verify V21` → success.

Do not use a previous commit's green run as evidence.

---

### Task 7: Deploy Edge Function and production-smoke the Settings API

**Files:**
- No repository changes unless smoke reveals a defect.

**Interfaces:**
- Deploy only `v21-zalo-admin`; no new database migration in this phase.
- Preserve existing production mapping rows.

- [ ] **Step 1: Deploy `v21-zalo-admin` from the exact verified head**

Deploy with the existing project `gcnoahqsrquxkwkjbuxy`, using normal JWT verification/auth flow already present in the function.

- [ ] **Step 2: Read-only production verification**

Before any mutation, confirm:
- `zalo_user_links` still contains existing mappings;
- `Cha yêu` mapping is unchanged;
- `admin_snapshot` returns active users, contacts, links and no `auth_user_id`/password fields.

- [ ] **Step 3: Safe mutation smoke**

Use a deliberately chosen unlinked test Zalo contact only if the user approves creating a real Chat test account. If no safe contact is available, stop at read-only API verification rather than altering a real person's mapping.

When mutation smoke is allowed, verify:
- create exactly one Auth user + one `v21_accounts` row + one `zalo_user_links` row;
- returned account avatar is the direct Zalo URL only when `use_zalo_avatar=true`;
- unlink removes only mapping and leaves Chat account/history intact;
- cleanup test account after smoke if it is test-only.

- [ ] **Step 4: Final production regression**

Send one text each direction through the existing linked `Cha yêu` conversation and verify no duplicate/echo regression. Do not test media/call in this phase.

---

## Self-review against the spec

- Admin-only centralized Settings view: Tasks 4–5.
- Existing Chat user link/change/unlink: Task 4, using existing backend actions.
- Zalo-only contact create-and-link: Tasks 3–4.
- One-to-one canonical mapping: unchanged existing schema/RPC, Tasks 2–3.
- Password never stored/returned: Tasks 1, 3, 4.
- Direct avatar URL for new accounts: Task 3; no file copy.
- Existing account avatar not silently overwritten: link action remains unchanged; Task 3 only sets avatar during new-account creation.
- Existing per-profile picker preserved: Tasks 2 and 6.
- Responsive desktop/mobile UI: Task 4.
- No Render/account-admin coupling: no Render files touched.
- No media/call scope creep: explicitly excluded globally and in Task 7.
- Canonical source/build and CI gates: Tasks 5–6.
