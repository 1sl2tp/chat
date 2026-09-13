# Customer Order Source Timeline — Design

Date: 2026-09-13
Repo: `1sl2tp/chat`
Status: Design for user review

## 1. Goal

Keep Chat simple for the customer and for the operator. Customers continue typing naturally. The app must not require them to use a special order syntax and must not treat AI as the authority that creates the order.

On desktop, the operator needs three stable areas:

`Danh bạ | Nguồn báo hàng của khách | Công việc / nhập đơn`

The middle area shows only customer-sent messages relevant to order work, grouped by a selected time window. The right area is the real order-entry workspace. AI and text splitting are optional helpers only.

## 2. Source-of-truth rule

Only inbound customer messages are eligible as order source material.

Do not include admin/operator replies in the source timeline, even when those replies contain corrected shorthand product names. Operator messages may remain visible in the normal chat history, but they must not be collected into the order-source aggregate and must never add quantity to an order.

Each source item must retain:

- original message id;
- conversation/contact id;
- exact original text;
- original sent timestamp;
- processing state.

The original customer text is immutable. Parsing or product mapping must never rewrite it.

## 3. Time windows

The order-source view supports:

- `Hôm nay` — default;
- `Hôm qua`;
- `Tuần này`;
- `Tùy chọn` — explicit start/end date.

The time filter is per currently selected customer. Switching customer immediately switches the source timeline to that customer while preserving the chosen time window when practical.

Messages are ordered chronologically so the operator can understand additions, corrections, and repeated requests in the same sequence the customer sent them.

## 4. Order-related filtering

The system should reduce noise but must not silently discard uncertain source material.

Use a two-stage classifier:

1. **Deterministic candidate filter first.** A customer message becomes an order candidate when it contains common quantity/order patterns, multiple product-like lines, packaging/unit words, or a previously recognized customer alias. This stage must work without AI.
2. **AI relevance helper second, optional.** AI can classify ambiguous messages as likely order-related, but its result is advisory. If AI is unavailable, malformed, slow, or returns an invalid payload, the deterministic candidates still render and order entry remains usable.

The UI must provide a small `Hiện tất cả tin khách` fallback so the operator can inspect inbound messages in the selected time window if the automatic filter missed something.

No message is deleted from chat and no message is automatically converted into a finalized order line.

## 5. Processing states

Each source message has one of these local/business states:

- `Chưa xử lý` — source exists but has not been used for the working order;
- `Đang xử lý` — operator has opened/split it while entering the order;
- `Đã nhập` — at least one order-draft action is explicitly linked to this source message;
- `Bỏ qua` — operator explicitly marks it irrelevant for this order cycle.

A message must not become `Đã nhập` merely because AI parsed it. It becomes `Đã nhập` only after operator action adds or confirms order-draft content tied to that source.

The state is reversible while the order is still a draft.

## 6. Desktop layout

Keep the current three-column shell, but make responsibilities explicit:

### Column 1 — Danh bạ

Existing contact list. Selecting a contact drives both the middle source timeline and the right work iframe/context.

### Column 2 — Nguồn báo hàng / Chat context

This column remains a readable chat-width column, not a sales workspace. It contains:

- customer header;
- time selector `Hôm nay | Hôm qua | Tuần này | Tùy chọn`;
- order-source message cards;
- timestamp per source block;
- status `Chưa xử lý / Đang xử lý / Đã nhập / Bỏ qua`;
- `Hiện tất cả tin khách` fallback;
- access back to ordinary full chat when needed.

The column must scroll independently. Its scrolling must never move or resize the work iframe.

### Column 3 — Công việc / nhập đơn

This is the largest column and remains independent from chat scrolling. It contains the product search, quantity controls, price/order work, draft-order controls, and debt/order navigation.

The right side must not depend on successful AI parsing. The operator can always search a product and enter quantity manually.

## 7. Mobile layout

Mobile stays one-column.

`Trò chuyện | Công việc` remains the high-level navigation.

From a customer conversation, opening order work carries:

- contact id;
- selected time window (default today);
- selected source message ids, if any;
- current open draft id, if one exists.

The operator can return to the source timeline without losing the draft. Do not add a permanent third panel or desktop-style split to mobile.

## 8. Split / “Tách” behavior

`Tách` is a convenience tool, not an order authority.

### Quick split — required baseline

Must work without AI. For line-oriented customer input it should:

- preserve each source line;
- detect a leading quantity when obvious;
- keep the remainder as `Tên gốc` exactly as written;
- never normalize spelling or silently map a product.

Example:

`3 chua có đường` → quantity `3`, raw name `chua có đường`.

If a line cannot be split safely, keep it as one unresolved raw source line rather than failing the whole operation.

### AI split — optional helper

Used only for prose-like messages where multiple items are embedded in one paragraph. AI may propose quantity/name spans from the exact source text. The operator must be able to edit or ignore the result.

AI failure must never block manual order entry.

## 9. Fix for misleading “200” failures

The current client invokes `v21-order-scribe` and treats the returned body separately from transport errors. The redesign must make the response contract explicit:

- HTTP success plus `{ok:true,...}` = success;
- HTTP success plus `{ok:false,error:...}` = application failure and must show the actual application error, never a generic “200” message;
- non-2xx response = transport/application failure with normalized error code;
- malformed/non-JSON body = `invalid_response`;
- AI provider failure = `ai_unavailable` or a similarly stable internal code, while quick/manual split remains available.

The UI error should be short and actionable, e.g. `AI chưa dùng được — vẫn có thể Tách nhanh hoặc nhập tay.`

Do not surface raw HTTP status text like `200` as the primary user-facing error.

## 10. Existing code behavior that must change

Current `v21-order-scribe` resolves either explicit selected text or only the single latest inbound customer message. That is insufficient for the required day/week workflow.

The new source-timeline flow must query inbound messages by contact + conversation + time range, not just `limit(1)` latest inbound.

Current quick parsing remains useful as the non-AI baseline and should be reused/strengthened rather than replaced by AI.

## 11. Draft-order relationship

The source timeline and the draft order are related but separate:

- source timeline answers: **“Khách đã báo gì trong khoảng thời gian này?”**;
- draft order answers: **“Mình đã nhập gì thành đơn?”**.

A draft may use several source messages from the same customer. A later customer message in the same day can be added to the same open draft.

Do not auto-merge repeated lines from different messages. The operator decides whether a repeated request is a correction, duplication, or additional quantity.

A lightweight link should be stored from draft activity to source message ids so the UI can mark `Đã nhập` accurately and avoid relying on text comparison.

## 12. Failure and fallback rules

- Database/message query fails: keep current order workspace usable; show source timeline error only in the middle column.
- AI fails: fall back to deterministic filter + quick split + manual entry.
- Quick split partially fails: return successful lines and unresolved raw blocks; do not discard source text.
- Time-range query returns no candidates: show `Không thấy tin báo hàng trong khoảng này` plus `Hiện tất cả tin khách`.
- Customer changes while an order draft is open: do not silently retarget the draft. Right column must show the draft/customer identity explicitly.

## 13. No-scope items

This change does not:

- require customers to change message format;
- auto-finalize orders;
- auto-delete duplicates;
- treat operator replies as order source;
- redesign call/media/chat sending behavior;
- introduce supermarket/news features;
- move deployment away from the current GitHub Pages production path.

## 14. Test gates

Implementation must add tests for:

1. inbound-only aggregation — admin/operator messages are excluded;
2. today/yesterday/week/custom range boundaries;
3. source ordering and state preservation;
4. quick split works without AI;
5. one bad/unresolved line does not fail the whole split;
6. AI failure falls back without blocking order entry;
7. HTTP-200 + `{ok:false}` is shown as an application error, not “error 200”;
8. selected customer drives source timeline while an existing draft cannot silently switch customer;
9. source message ids can be linked to draft activity and produce `Đã nhập` accurately;
10. desktop independent scrolling: source column scroll does not move the work iframe;
11. mobile remains one-column;
12. full existing Verify V21, Admin Push TDD, and Zalo Bridge TDD remain green.

## 15. Acceptance criteria

For a selected customer, the operator can open `Hôm nay` and immediately see only that customer's inbound order-related messages for today in chronological order. The operator can switch to yesterday/week/custom range, inspect the exact raw text, split easy text without AI, optionally use AI for difficult prose, and manually enter the order in the independent right-side workspace. AI or split failure never prevents manual entry, and the UI never reports a raw HTTP `200` as the user-facing failure reason.
