# Chat Project State

Last reviewed: 2026-08-31
Purpose: short recovery checkpoint. This file does not replace Git history, CI results, database migration history, or `src/version.ts`.

## Production baseline

- Integration branch: `main`
- Named runtime version currently present on `main`: `CHAT-ADMIN-0.9.1`
- Observed `main` head before this documentation work: `619215cf16ed6c1dce1bb287579e6c84ca6f46be`
- Production deploy PASS is not asserted here unless verified separately from GitHub Actions/deployment state.

## Active development

- Branch: `feature/auth-identity-mobile-0.10.0`
- Release target: `CHAT-AUTH-0.10.0`
- Runtime version file on the feature branch still reports `CHAT-ADMIN-0.9.1`; the version bump belongs to the final release gate, not this documentation/tooling change.
- Current architecture direction: `session -> identity -> surface-specific startup` with one canonical message runtime.

## Backend

- Supabase project: `gcnoahqsrquxkwkjbuxy`
- Project name observed in Supabase: `shop taphoa`
- Relevant applied 0.10 migration checkpoints observed on 2026-08-31:
  - `20260831050322 chat_auth_010_identity_resolution`
  - `20260831051600 chat_auth_010_customer_upgrade`
- `chat_resolve_identity()` already exists in the live backend; repository/backend history must remain reconciled rather than recreating the RPC blindly.
- Secrets, passwords, service-role keys, TURN credentials, and private tokens must never be recorded in this file.

## Current subsystem status

- Auth/Identity: 0.10 development in progress on the feature branch.
- Customer Chat: existing canonical message runtime remains in use.
- Admin: feature branch contains Admin login/access-denied/workspace wiring under the 0.10 architecture.
- Mobile: viewport owner exists, but the 0.10 mobile release gates are not yet all PASS.
- Voice/WebRTC/TURN: backend history/tables/RPCs exist, but Voice/TURN is outside the current 0.10 release scope until Auth/Identity/mobile foundations are stable.
- TURN provider direction: Cloudflare Realtime TURN. Provider secrets/config are managed outside this checkpoint.

## Current repair-tooling work

This branch is adding:

- `docs/REPAIR_MAP.md`
- `docs/REGION_REGISTRY.md`
- `docs/region-registry.json`
- `docs/MOBILE_CONTRACT.md`
- `docs/CHANGE_TRACE.md`
- architecture validation scripts/gates

These files are developer/recovery metadata only and must not become a second runtime state machine.

## Next implementation boundary

After repair-routing tooling passes, continue the existing `CHAT-AUTH-0.10.0` implementation plan from the actual branch/database state. Do not restart already-applied identity/customer-upgrade backend work and do not pull Voice/TURN back into the Auth release.