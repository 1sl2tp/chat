# Mobile Contract

This contract treats OS and display mode as separate runtime dimensions. Do not collapse them into one `isMobile` flag.

## Required runtime gates

Every mobile release must be verified in all four contexts:

- `iOS / browser` — Safari tab.
- `iOS / standalone` — Home Screen web app / installed standalone experience.
- `Android / browser` — Chrome tab.
- `Android / standalone` — installed PWA.

A PASS in one context does not imply PASS in another.

## Runtime context dimensions

Track these independently when diagnosing display problems:

- Platform: iOS / Android / desktop / unknown.
- Display mode: browser / standalone / unknown.
- Viewport state: normal / keyboard-open / rotated / resumed.
- Orientation: portrait / landscape.

Platform/display-mode context is diagnostic input. Business role, Auth state, and message state must not depend on it.

## Ownership

- `src/viewport/` owns visual viewport and keyboard geometry publication.
- Screen/shell parents own screen height, safe-area placement, and primary scroll containment.
- Component CSS owns typography, visual size, and practical tap geometry.
- `src/pwa/` + `src/sw.ts` own install/update/cache lifecycle, not keyboard/layout repair.
- A screen may consume viewport state but must not create a competing viewport state machine.

## Viewport and zoom invariants

- Meta viewport uses `width=device-width, initial-scale=1.0, viewport-fit=cover`.
- Do not add `user-scalable=no`.
- Do not add `maximum-scale=1`.
- User pinch zoom remains available for accessibility.
- iOS focus auto-zoom is prevented by keeping editable text controls at least 16px computed font size on iOS-class mobile layouts, not by disabling zoom.
- Do not hard-code software keyboard heights.

## Keyboard invariants

- Composer stays visible above the software keyboard.
- If the user is already near the bottom, opening the keyboard keeps the latest message visible.
- If the user is reading older messages, opening the keyboard must not force-scroll to the latest message.
- Keyboard close/open cycles must not accumulate blank space.
- Orientation changes with the keyboard open must recover to valid geometry.
- Background -> resume with an existing focus/keyboard state must recover to valid geometry.
- Safari browser and iOS standalone are tested separately because browser chrome and standalone viewport lifecycles differ.
- Android Chrome and Android installed PWA are tested separately for the same reason.

## Safe-area invariants

- Use `env(safe-area-inset-top/right/bottom/left)` at the owning shell/parent region.
- Do not repair a shell safe-area problem with margins on an individual child button.
- Header must remain usable around notch/Dynamic Island areas.
- Footer/composer must remain usable above the home indicator/system gesture area.

## Scroll ownership

- `body`/page must not compete with the conversation scroller.
- Chat screen owns visible viewport height.
- Message list is the primary vertical conversation scroller.
- Composer is a fixed grid region of the screen, not a page-scroll workaround.
- Textarea may scroll internally only after reaching its max height.

## Responsive gates

Minimum supported width: 280px.

Required width checks:

- 280px
- 320px
- 390px
- 480px
- representative desktop widths (including 760px and wider)

At each gate verify:

1. no horizontal overflow;
2. no clipping outside the owning parent;
3. no sibling overlap;
4. long text cannot break parent geometry;
5. the intended scroll owner remains the only primary scroller.

## Touch geometry

- Practical touch targets should be approximately 44px where relevant.
- Visual artwork may be smaller than the touch target.
- Compact layouts must not shrink the practical hit area merely to preserve appearance.

## Current known non-PASS gaps on the 0.10 feature branch

These are intentionally recorded as gaps rather than silently treated as PASS:

1. `.chat-composer__input` currently uses `font-size: 15px`; this violates the iOS editable-control >=16px contract and can trigger Safari focus auto-zoom.
2. At `max-width: 320px`, `.chat-composer__plus` and `.chat-composer__send` visually shrink to 34x34px. A later owning-component fix must preserve compact visuals while keeping a practical ~44px hit target.
3. `src/ui/chat/customer-screen.ts` directly attaches `visualViewport` resize/scroll listeners for scroll behavior while `src/viewport/` is the canonical viewport owner. This is an ownership debt: the screen should eventually consume canonical viewport publication rather than independently observe the browser API.
4. The four runtime gates above have not all been verified on physical devices for the 0.10 branch.

These gaps belong to the later mobile-hardening implementation. This documentation/tooling change does not patch them.