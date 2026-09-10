# Chat-owned GETLINK auth design

## Goal

Treat `chat.taphoa.xyz` as the single application/authentication owner and `get.taphoa.xyz` as a module that consumes Chat identity. GETLINK may remain publicly reachable as a standalone URL, but it must not create accounts, perform username/password login, own refresh tokens, or maintain an independent authentication lifecycle.

## Product rule

- Chat owns account creation, login, logout, token refresh, role (`admin` / `user`) and current account identity.
- GETLINK owns product/search/supermarket/sales UI and order operations, but receives identity from Chat.
- Both continue to use the same Supabase project and the same `v21_accounts` identity source.
- Public/read-only GETLINK views may remain available without login.
- Any operation that requires identity (send order, order management, admin customer selection, admin actions, future protected management screens) requires a Chat-issued authenticated session.
- GETLINK must never expose a second username/password login form.

## Runtime modes

### Embedded inside Chat

1. User authenticates in Chat.
2. Chat's existing auth session store owns the Supabase session.
3. The GETLINK iframe requests auth from its parent or receives it on load/auth changes.
4. Chat sends only the current short-lived access token and the current account snapshot to the exact GETLINK origin.
5. GETLINK validates the access token through its backend (`getlink-orders` / shared protected API) and uses the server-resolved `v21_accounts` identity.
6. GETLINK does not persist or refresh the token independently.
7. When Chat logs out, changes account, or refreshes token, Chat pushes the new state to GETLINK.

Expected UX: opening Công việc never asks for login again when Chat is already authenticated.

### GETLINK opened directly

- Public/read-only content may render normally.
- If the user invokes a protected action and no Chat-issued session is available, GETLINK does not show a local login form.
- GETLINK redirects/navigates to Chat's login route with a validated return target pointing back to GETLINK.
- After successful Chat authentication, Chat returns the user to GETLINK and hands off the current access token through an explicit one-time handoff flow.
- GETLINK consumes that token for protected calls but still does not own token refresh or account lifecycle.

This preserves the option to keep GETLINK public today and later make it iframe-only without changing identity, data, or order architecture.

## Auth boundary

### Chat responsibilities

- Account registration and login UI.
- Supabase auth session creation and refresh.
- Mapping the authenticated auth user to `v21_accounts`.
- Logout and account switching.
- Embedded bridge to GETLINK.
- Direct-open return/handoff flow.

### GETLINK responsibilities

- Accept auth only from the exact trusted Chat origin in iframe mode.
- Accept direct-open handoff only through the explicitly designed Chat return flow.
- Store at most the short-lived access token in session-scoped memory/storage as needed for current page requests.
- Never store a refresh token.
- Never call Supabase password-login endpoints.
- Never create or edit Chat accounts.
- On 401/expired session, clear local transient auth and send the user back through Chat authentication instead of showing a GETLINK login form.

## Order/account behavior

- `user`: server derives the customer from the authenticated Chat account; the browser cannot choose another customer.
- `admin`: server verifies Chat admin role; GETLINK may show the customer picker sourced from Chat `role=user` accounts and send the chosen `customerId`.
- Order data remains canonical in GETLINK/Supabase order tables and is not stored only in Chat messages.
- Existing order state flow remains `Đơn tạm -> Đã giao -> Đã hoàn`; debt is posted only on delivery and reversed on return.

## Security rules

- Exact-origin `postMessage`; no wildcard target origin.
- No refresh token crosses the iframe boundary.
- Backend trusts the bearer token and server-side account lookup, not the account object supplied by the browser.
- GETLINK order mutation RPCs remain service-role-only behind Edge Functions.
- Return URLs must be allowlisted to GETLINK origin/path to avoid open redirects.
- Protected UI state is cleared on Chat logout, token rejection, or account switch.

## Code changes

### `1sl2tp/getlink`

- Remove `chatLogin()` and the username/password login form from `order-management.js`.
- Replace local-login fallbacks with a single `requireChatAuth()` path.
- Embedded mode: request auth from Chat parent and wait briefly for bridge response.
- Standalone mode: route protected actions to Chat login/return flow.
- Keep public/read-only product/news/supermarket browsing unchanged.
- Preserve existing Admin customer picker and order-management UI after authenticated identity is present.

### `1sl2tp/chat`

- Keep the existing iframe auth bridge as the primary embedded path.
- Add a small direct-open GETLINK return/handoff route/state so Chat can authenticate first and then return the user to GETLINK.
- Keep Chat as the only account/login UI.
- Clear/synchronize GETLINK auth on Chat logout, account switch and token refresh.

## Error handling

- Embedded + Chat authenticated but bridge not yet received: show a lightweight "Đang xác thực..." state, not a login form.
- Embedded + Chat unauthenticated: ask the parent Chat shell to open Chat login.
- Standalone + protected action without auth: navigate to Chat login with return target.
- Backend 401: discard transient GETLINK auth and re-enter Chat auth flow.
- Invalid origin/handoff/return target: ignore/reject and stay unauthenticated.

## Testing

### GETLINK contracts

- No password-login endpoint call remains.
- No GETLINK username/password login inputs remain.
- Embedded protected action requests parent Chat auth instead of opening local login.
- Standalone protected action sends user to Chat login/return flow.
- User cannot submit another customer's ID.
- Admin customer picker still requires authenticated admin identity.

### Chat contracts

- Existing bridge sends access token only to exact GETLINK origin.
- Refresh token is never included.
- Logout/account switch pushes cleared/new auth state.
- GETLINK auth requests receive the current Chat session.
- Direct-open return target is allowlisted and returns to GETLINK only.

### Verification gates

- Full Chat V21 verification.
- Full GETLINK verification.
- `node --check` for touched JS.
- `deno check` for touched Edge Functions if any backend code changes.
- Production smoke: Chat authenticated -> Công việc opens without login; standalone GETLINK protected action -> Chat login -> returns authenticated; logout in Chat invalidates GETLINK protected UI.

## Non-goals

- No migration of historical TAPHOAXYZ accounts.
- No second identity table.
- No refresh-token sharing.
- No requirement to make GETLINK iframe-only now.
- No changes to public news/supermarket browsing unless they depend on protected actions.