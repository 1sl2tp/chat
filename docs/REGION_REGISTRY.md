# Region Registry

`docs/region-registry.json` is the machine-readable source for stable UI Region IDs. This file explains how to use it.

## Why Region IDs exist

CSS classes, file names, and component boundaries can move. A semantic region should remain findable across those implementation changes.

Examples:

- `CUSTOMER_CHAT/COMPOSER`
- `CUSTOMER_CHAT/COMPOSER/INPUT`
- `ADMIN/INBOX`
- `ADMIN/CONVERSATION/MESSAGES`

A Region ID identifies **where the symptom is visible**. It does not automatically identify **where the bug must be repaired**. Use `REPAIR_MAP.md` after locating the region.

## Syntax

- IDs use uppercase ASCII words/numbers/underscore.
- Levels are separated with `/`.
- IDs never encode platform (`IOS`, `ANDROID`) or display mode (`PWA`, `BROWSER`). Runtime context is recorded separately.
- Root: `APP`.
- Surface roots: `CUSTOMER_CHAT`, `ADMIN`.

## Parent trace

When a visible region is wrong, trace upward before editing:

`Owner/Parent -> Sibling -> Child/Leaf`

Example:

`CUSTOMER_CHAT -> CUSTOMER_CHAT/FOOTER -> CUSTOMER_CHAT/COMPOSER -> CUSTOMER_CHAT/COMPOSER/INPUT`

If the footer/viewport contract is wrong, do not repair it with input margin/padding. If parent geometry passes and only the editable control violates typography, repair the input owner.

## Registry fields

Each JSON entry contains:

- `id`: stable semantic address.
- `parent`: existing parent ID or `null` for `APP`.
- `surface`: broad UI surface.
- `owner`: primary implementation file for the region.
- `geometryOwner`: file that owns placement/layout geometry.
- `stateOwner`: canonical state/contract owner when the region consumes one; otherwise `null`.
- `locator`: current CSS selector, route, or DOM locator used to find the region quickly.
- `contract`: short invariant explaining what the region owns and must not own.

## Current registered regions

| Region ID | Current locator | Primary owner | Main state/contract owner |
| --- | --- | --- | --- |
| `APP` | `#app` | `src/main.ts` | `src/app/startup.ts` |
| `CUSTOMER_CHAT` | `.chat-screen` | `src/ui/chat/customer-screen.ts` | `src/chat/store.ts` |
| `CUSTOMER_CHAT/HEADER` | `.chat-header` | `src/ui/chat/customer-screen.ts` | — |
| `CUSTOMER_CHAT/MESSAGE_LIST` | `.chat-messages` | `src/ui/chat/message-list.ts` | `src/chat/message-runtime.ts` |
| `CUSTOMER_CHAT/FOOTER` | `.chat-footer` | `src/ui/chat/customer-screen.ts` | — |
| `CUSTOMER_CHAT/COMPOSER` | `.chat-composer` | `src/ui/chat/composer.ts` | `src/ui/chat/composer.ts` |
| `CUSTOMER_CHAT/COMPOSER/INPUT` | `.chat-composer__input` | `src/ui/chat/composer.ts` | — |
| `CUSTOMER_CHAT/COMPOSER/PLUS` | `.chat-composer__plus` | `src/ui/chat/composer.ts` | — |
| `CUSTOMER_CHAT/COMPOSER/SEND` | `.chat-composer__send` | `src/ui/chat/composer.ts` | — |
| `CUSTOMER_CHAT/PROFILE_FORM` | `.profile-sheet` | `src/ui/chat/profile-form.ts` | `src/profile/runtime.ts` |
| `CUSTOMER_CHAT/OVERFLOW_MENU` | `.chat-menu` | `src/ui/chat/overflow-menu.ts` | — |
| `ADMIN` | `/admin` | `src/app/startup.ts` | `src/identity/runtime.ts` |
| `ADMIN/LOGIN` | `.admin-login` | `src/ui/admin/login.ts` | — |
| `ADMIN/WORKSPACE` | `.admin-screen` | `src/ui/admin/screen.ts` | `src/admin/store.ts` |
| `ADMIN/INBOX` | `.admin-inbox` | `src/ui/admin/screen.ts` | `src/admin/store.ts` |
| `ADMIN/CONVERSATION` | `.admin-conversation` | `src/ui/admin/screen.ts` | `src/admin/store.ts` |
| `ADMIN/CONVERSATION/DETAIL` | `.admin-detail` | `src/ui/admin/screen.ts` | `src/admin/store.ts` |
| `ADMIN/CONVERSATION/MESSAGES` | `.admin-messages` | `src/ui/admin/screen.ts` | `src/chat/message-runtime.ts` |
| `ADMIN/CONVERSATION/COMPOSER` | `.admin-composer.chat-composer` | `src/ui/chat/composer.ts` | `src/chat/message-runtime.ts` |

## Adding a region

1. Confirm it is a stable semantic region, not a temporary CSS wrapper.
2. Choose the correct parent.
3. Add the JSON entry with real current file paths and locator.
4. Add the Region ID to this human-readable table.
5. Route its common failure modes in `REPAIR_MAP.md` when useful.
6. Run `npm run check:architecture`.

## Moving implementation

If files/classes move but semantic meaning stays the same:

- keep the Region ID;
- update `owner`, `geometryOwner`, `stateOwner`, and/or `locator`;
- keep history searchable by the same ID.

## Retiring a region

Do not reuse an old Region ID for a different semantic meaning. Preserve the old ID in Git history/change records and introduce a new ID for the new region.

## Runtime rule

Production application behavior must not depend on this registry. It is developer/recovery metadata for finding and tracing code.