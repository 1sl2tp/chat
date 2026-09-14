# Restore CHAT-owned Công việc workspace

## Goal

Remove the embedded GETLINK application from CHAT while preserving CHAT's existing `Công việc` route/tab. GETLINK remains a separate application at `get.taphoa.xyz` and is not modified by this change.

## Current problem

CHAT currently renders `Công việc` as an iframe owned by GETLINK (`workGetlinkFrame`, `https://get.taphoa.xyz/?embed=1`) and includes a GETLINK auth bridge. This makes CHAT's work area depend on GETLINK and blurs ownership between the two apps.

The iframe integration was introduced by commit `13d5d1f2286f41bdc5ba872f9a40c012bd71f8b7`, which added the `work` route/tab, the GETLINK iframe, and auth synchronization together. Reverting that commit wholesale is not acceptable because the user wants to keep the `Công việc` tab.

## Target ownership

```text
CHAT
├── Trò chuyện
└── Công việc
    └── CHAT-owned work surface

GETLINK
├── Bán hàng
├── Siêu thị
└── Tin tức
```

There is no iframe relationship between CHAT and GETLINK after this change.

## CHAT behavior

- Keep the top-level `Trò chuyện | Công việc` navigation and the `work` route.
- Replace the GETLINK iframe inside `workThreadView` with a lightweight CHAT-owned placeholder surface.
- The placeholder must clearly belong to CHAT and contain no GETLINK URL, iframe, embed parameter, auth bridge, or GETLINK runtime dependency.
- Switching between `Trò chuyện` and `Công việc` must continue to use CHAT's existing navigation state and must not disturb chat/call/auth state.
- Desktop geometry (`Danh bạ | Trò chuyện | Công việc`) remains owned by CHAT.
- Narrow/mobile keeps the existing one-view-at-a-time route behavior.

## Removed integration

Remove all CHAT-side GETLINK embedding concerns that are only needed by the iframe:

- `#workGetlinkFrame`
- `.work-thread-embed` / GETLINK-specific frame ownership markup where no longer needed
- `https://get.taphoa.xyz/?embed=1`
- GETLINK auth-postMessage bridge and its event listeners
- tests/assertions that specifically require the GETLINK iframe or auth bridge

Do not remove generic `work` route/navigation behavior.

## Scope boundaries

In scope:
- `1sl2tp/chat` only
- work route/view markup and CHAT-owned styling
- removal of GETLINK iframe/auth bridge integration
- tests necessary to lock the new ownership contract

Out of scope:
- any modification to `1sl2tp/getlink`
- Chat/Call/Auth business logic unrelated to the removed bridge
- redesigning the future contents of `Công việc`
- changing production `main` before verification

## Validation

The change is successful when:

1. CHAT contains no iframe pointing at `get.taphoa.xyz`.
2. CHAT contains no `workGetlinkFrame` and no GETLINK auth bridge runtime.
3. `Trò chuyện` and `Công việc` still switch correctly.
4. `Công việc` renders a CHAT-owned placeholder on desktop and mobile.
5. Existing Chat/Call/Auth verification remains green.
6. GETLINK remains untouched.

## Delivery

Work on branch `feature/restore-chat-workspace-owner`. Run the repository's canonical build/verification flow and inspect the resulting diff before any merge to `main`.
