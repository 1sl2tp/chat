# CHAT-AUTH-0.10.0 — Auth, Identity Roles, and Mobile Hardening Design

Date: 2026-08-31
Status: Approved design, specification for implementation planning
Target release: CHAT-AUTH-0.10.0

## 1. Purpose

Replace the temporary 0.9.x admin-session behavior with a durable identity architecture for the new Chat app. The application has one shared authentication/session foundation, but three runtime identity states:

- guest customer (User 1)
- registered customer (User 2)
- admin

Guest and registered customer are the same customer product surface with different account state. Admin is a separate privileged role, not a guest/customer mode and not inferred from the `/admin` route.

This release also makes iPhone/iOS and Android mobile behavior a release contract rather than a set of local visual fixes.

## 2. Non-negotiable ownership rules

The existing `docs/FOUNDATION_OWNERSHIP.md` remains authoritative.

- `src/session/` owns Auth token/session lifecycle only.
- `src/identity/` will own resolved application identity and role lifecycle: guest customer, registered customer, admin, and customer upgrade/link state.
- `src/device/` owns stable client-device identity and labeling only.
- `src/chat/` owns support conversation/message state and orchestration only.
- `src/admin/` owns admin inbox/selection/detail state only.
- `src/viewport/` owns visual viewport and keyboard geometry only.
- `src/supabase/` remains adapter-only and must not become a second state owner.
- UI surfaces consume owner state and must not infer business role independently.

There must be no second Auth state machine and no second message state machine.

## 3. Session model

`src/session/` continues to represent only Supabase Auth/session lifecycle, such as:

- initializing
- anonymous
- authenticated
- refreshing
- expired
- signed-out

It must not equate `authenticated` with `admin`.

After an Auth session becomes available, application identity is resolved separately from backend data.

## 4. Identity model

`src/identity/` resolves one of the following application states:

### 4.1 Guest customer

A guest customer is User 1.

- Opening `/` with no existing session automatically creates an anonymous Auth session.
- Anonymous sign-in is an implementation detail and is not shown as a login flow.
- The guest receives or restores a stable customer profile, device, and support conversation.
- The guest can chat with Admin immediately.
- The guest cannot access Admin data or Admin RPCs.
- The guest session is persisted by the Auth/session layer and restored automatically on the same browser/PWA installation where possible.

### 4.2 Registered customer

A registered customer is User 2: the same customer after account upgrade/linking.

- Upgrading a guest must preserve the existing customer profile ID.
- The same support conversation must remain attached.
- Existing message history must remain intact.
- Existing device history must remain associated with the same customer profile where appropriate.
- Account upgrade/linking must not silently create a second customer record.
- On a new device or after explicit sign-out, a registered customer must authenticate before restoring that registered account.
- On a device with a valid persisted registered session, the app restores it automatically.

The exact customer credential UX may be introduced in this release only to the minimum needed for a correct lifecycle; unrelated account-management features remain out of scope.

### 4.3 Admin

Admin is a privileged account class and must be resolved from backend authorization, not from frontend routing.

- `/admin` never creates an anonymous Auth session.
- If there is no Auth session, `/admin` shows an Admin login surface.
- After login, backend identity/role resolution must confirm that the account is an Admin.
- An authenticated non-Admin customer must be denied Admin access.
- A valid Admin session may bootstrap/refresh its device/session registration, but it must not create a customer support conversation for itself.
- Admin logout returns to Admin login.
- Admin authorization remains enforced server-side in RPC/RLS; frontend state is presentation/orchestration only.

## 5. Route behavior

### `/`

1. Restore Auth session.
2. If no session exists, create anonymous session.
3. Resolve application identity.
4. Bootstrap/restore customer profile and device.
5. Bootstrap/restore support conversation.
6. Start shared chat message runtime.
7. Mount customer chat surface.

If the restored session belongs to an Admin account, the customer route must not reinterpret it as a guest customer. The UI should present an appropriate route/account state rather than creating a customer identity for the Admin.

### `/admin`

1. Restore Auth session.
2. If none, show Admin login.
3. If session exists, resolve application role.
4. If role is not Admin, deny Admin access without creating any anonymous account.
5. If Admin, bootstrap/refresh Admin device/session metadata.
6. Load Admin inbox.
7. Start shared message runtime only after a conversation is selected.

## 6. Backend authorization and data contracts

Backend is the authority for role and access.

Required behavior:

- A role/identity resolution contract must identify whether the current Auth principal maps to guest customer, registered customer, or admin.
- Admin RPCs must continue to enforce Admin authorization server-side.
- Customer-only profile/support bootstrap must not be used to convert an Admin into a customer.
- Customer upgrade/link must preserve the canonical `chat_profiles.id` and conversation membership/history.
- Migrations must be additive where possible; existing customer data and the current Admin account must not be deleted or recreated.

Existing 0.9.x data, including current support conversations, must be preserved.

## 7. Logout and restore semantics

### Guest customer

Guest sessions are normally restored automatically. Explicit destructive guest-session reset is not part of this release unless required by an existing approved menu action.

### Registered customer

- Normal app restart/browser restart: restore valid session automatically.
- Explicit logout: end registered Auth session.
- Returning after logout: the registered account requires authentication again before its history is restored.
- Logout must not delete profile, conversation, or message history.

### Admin

- Normal app restart/browser restart: restore valid Admin session automatically.
- Explicit logout: clear Admin Auth session and return to Admin login.
- Admin logout must not alter customer data.

## 8. Mobile hardening contract

Mobile behavior is a release gate for iOS Safari, iOS Home Screen Web App, Android Chrome, and installed Android PWA.

### 8.1 Viewport and safe areas

- Use `viewport-fit=cover`.
- Respect `env(safe-area-inset-top/right/bottom/left)` at the correct shell/composer owners.
- Use `100dvh` where appropriate, with the existing `src/viewport/` owner publishing visual viewport/keyboard geometry.
- Do not hardcode keyboard heights.
- Do not let body/page scrolling fight the conversation scroller.

### 8.2 Keyboard behavior

- Composer remains visible above the software keyboard.
- If user is already near bottom when keyboard opens, latest message remains visible.
- If user is reading older messages, keyboard opening must not force-scroll to latest.
- Orientation changes and visual viewport resize must not trap the composer outside the visible area.

### 8.3 iOS zoom and form controls

- Text inputs and textareas used for editing must use at least 16px computed font size on iOS-class mobile layouts so Safari does not auto-zoom on focus.
- Do not use `user-scalable=no`, `maximum-scale=1`, or equivalent accessibility-hostile viewport restrictions.
- Interactive controls must use practical mobile tap targets, approximately 44px where relevant.
- Avoid touch behavior that causes accidental double-tap zoom or ghost activation on compact controls.

### 8.4 Responsive gates

Must verify at minimum:

- 280px
- 320px
- 390px
- 480px
- representative desktop widths

Customer and Admin surfaces must not horizontally overflow at these gates.

## 9. Admin login UX

The Admin login surface is functional, minimal, and clearly separate from customer chat.

Requirements:

- title identifies Admin access
- credential fields use browser-appropriate autocomplete attributes
- submit state is clear
- auth error is explicit but must not expose sensitive backend details
- no guest/anonymous fallback
- successful login transitions to Admin workspace only after role verification
- non-Admin authenticated account receives a clear access-denied state and can sign out/switch account

## 10. Customer account UX in 0.10

The product must expose enough account state to support the architecture but must not grow into a full account center.

Minimum requirements:

- Guest customer can continue chatting without login.
- Registered customer can restore an existing account on a new/signed-out device through an explicit login surface when that feature is invoked.
- Guest-to-registered upgrade path must be architecturally supported without losing history.
- Profile name/address remains separate from Auth credentials.

## 11. Migration from 0.9.1

`CHAT-ADMIN-0.9.1` remains the production baseline until 0.10 passes.

0.10 migration rules:

- do not rollback or delete existing customer profiles
- do not delete existing support conversations/messages
- preserve existing Admin account mapping
- remove the temporary assumption that `/admin` can directly bootstrap using the customer-oriented flow
- keep existing message runtime and Admin inbox/detail implementation where compatible
- adapt startup orchestration to session → identity resolution → surface-specific bootstrap

## 12. Security invariants

- Route names never grant roles.
- Browser state never becomes the final Admin authorization authority.
- Customer identity upgrade must not allow taking ownership of another profile.
- Admin RPCs remain protected even if frontend route checks are bypassed.
- Service-role keys and other server secrets never enter browser code.
- Anonymous customer capability must not leak Admin reads/writes.

## 13. Error states

Errors must be specific enough for correct UX ownership:

- no session on `/admin` → Admin login, not generic failure
- authenticated non-Admin on `/admin` → access denied / switch account
- customer bootstrap failure → customer connection error
- role resolution failure → identity error, not silent fallback to guest
- expired session → session owner handles refresh/expiry transition

No UI layer should hide an authorization failure by creating another account automatically.

## 14. Release verification gates

`CHAT-AUTH-0.10.0` may be called PASS only when all of the following are verified:

1. Guest opening `/` with no session receives a usable support chat automatically.
2. Guest reload restores the same canonical customer profile/conversation where session persistence permits.
3. `/admin` with no session shows Admin login and does not create an anonymous session.
4. Valid Admin login resolves Admin role and loads Admin inbox.
5. Authenticated non-Admin cannot access Admin RPC/data.
6. Admin session is not transformed into a customer/guest identity when `/` or `/admin` initializes.
7. Guest-to-registered upgrade preserves profile ID, support conversation, and message history.
8. Registered customer session restores automatically when valid and requires login after explicit logout.
9. Admin logout returns to Admin login without changing customer data.
10. Customer → Admin and Admin → Customer text messages remain realtime using the existing canonical message runtime.
11. Switching Admin conversations does not retain subscriptions to the previous conversation.
12. iOS Safari and Home Screen PWA pass keyboard/composer/safe-area behavior.
13. Android Chrome and installed PWA pass keyboard/composer behavior.
14. Form focus does not trigger unwanted iOS auto-zoom due to sub-16px input typography.
15. No horizontal overflow at 280/320/390/480 widths.
16. Production custom domain remains rooted at `/` and `/admin` direct navigation works.
17. Named version shows `CHAT-AUTH-0.10.0 · <build-id>`.
18. TypeScript, automated tests, production build, and GitHub Pages deploy all PASS on the exact `main` commit.

## 15. Out of scope

This release does not implement:

- P2P/friends/groups
- Push notification delivery backend
- Voice/WebRTC/TURN
- attachments/media sharing
- full account/profile settings center
- multi-admin organizational administration
- GPS/location inference

Push and Voice/TURN remain subsequent subsystems after Auth/identity/mobile gates are stable.

## 16. Success definition

The architecture is successful when Auth/session is a single shared foundation, application identity is resolved explicitly, Guest/User/Admin lifecycles cannot be confused with one another, existing customer history survives account evolution, and mobile Safari/Android behavior is treated as a first-class release requirement rather than patched after deployment.
