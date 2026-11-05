# Chat scroll audit

## Owner discovery
Read CURRENT_WORK.md, README_MAINTENANCE.md, README_RESOURCE_GUARDRAILS.md and README_NO_WAIT_WORKFLOW.md. Inspect app.js for scrollRoot, scrollToTail, markUserScrollIntent, restoreAnchor, viewport states, virtual window, interaction geometry, and touch handlers. Inspect mobile-ui-polish.css and the actual chat scroll container.

## Invariants
- Native user drag/wheel owns scroll immediately; no pending auto-tail frame may fight it.
- FOLLOW_TAIL only when explicitly eligible; USER_AWAY must retain anchor when messages or media load.
- Keyboard VisualViewport changes cannot reset history position.
- History pagination preserves first visible message offset.
- Date chips and media decode do not alter scroll unexpectedly.
- No new polling, ResizeObserver fanout, or repeated scroll writes without evidence.

## Tests
Exercise short/long conversations, rapid reverse swipes, images loading late, keyboard open/close, send while at tail and away, history prepend, iOS PWA overscroll. Record before/after scrollTop, scrollHeight, first visible message and screen recording. Run canonical build/verify, CI, deploy and device acceptance before claiming fixed.
