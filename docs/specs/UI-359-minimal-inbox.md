# UI-359 — minimalist mobile Chat inbox, 15 Nov 2026

Compare current iPhone Chat directory with Apple Messages. Preserve separate Chat/Work and every admin group.

- Show only Tất cả / Chưa đọc as the primary mobile filter set, with one accessible 44px expand control for KH, CM, TK NCC, Bạn bè, Khác. Keep active secondary group visible on collapse; desktop retains existing horizontal filters.
- The canonical `has_unread` flag alone controls text emphasis and avatar unread dot on the relevant contact; a global unread count accents Chưa đọc instead of placing a second dot on the already-open sidebar menu. The dot stays on the navigation icon while directory is closed.
- Preserve server unread/read ownership, ordering/scroll anchor, swipe/back, keyboard priority, min 44px touch controls, 2-line message previews, app chat/work routes, responsive iOS/Android and readable numeric time rail.
- Test `node tests/test_ui359_minimal_unread_inbox.js` wired into Verify V21. Release V21.72.40 triggers fresh canonical build + SW. E0 screenshot; E1 unit/CI; E2 no backend; E3 Pages verify; E4 physical iPhone+Android/realtime unread yet to confirm; E5 no new fetch, cron, DB or production message.
