# CHAT AI Incremental Scan — Implementation Plan

**Goal:** Every 15 minutes, process only NEW inbound text/images from contacts in group `customer`. CHAT AI only extracts literal `SL + ten`; it never searches product/catalog data and never rescans messages already acknowledged by the scan cursor.

## Locked behavior

- Customer scope: `v21_accounts.contact_group = 'customer'` only.
- Stable source order: add monotonic `v21_messages.message_seq`; timestamps remain metadata, never the primary cursor.
- First activation / newly-added customer: seed cursor to the current latest inbound message, so existing history is not scanned retroactively.
- Each scheduled pass reads only `message_seq > last_message_seq`.
- No new inbound messages => no Gemini request.
- New text and images are processed together in source order.
- AI responsibility: semantic noise filtering + image transcription + literal `quantity + name` extraction only.
- No product/catalog/brand/database matching in the scanner.
- Successful scan persists source-linked lines and advances the cursor atomically. Failed AI/network scan does not advance the cursor.
- Persist each extracted line with stable `line_seq`, `source_message_seq`, `source_line_no`, quantity, literal name, raw source and future `pending/completed` status.
- Keep one open CHAT-side aggregate per Admin/customer conversation. This aggregate is not a sales/product order and has no product foreign keys.
- Preserve source order; do not reorder by product/name/price.
- Existing manual AI action remains available and unchanged in UI.
- Legacy `isLikelyOrderSource` pre-filter is removed from the source Edge path; AI, not regex, decides whether new content contains order lines.

## Implementation

1. Add migration `20260915_chat_ai_incremental_scan.sql`:
   - monotonic `message_seq` + deterministic historical backfill;
   - scan runtime/token/lock;
   - per-customer cursors;
   - open aggregates, scan runs, extracted lines;
   - atomic lock/finalize RPCs;
   - baseline existing customer conversations at current inbound max sequence;
   - pg_cron job `chat-ai-order-scan-15m` using `*/15 * * * *` and pg_net.
2. Add `v21-order-auto-scan` Edge Function with custom scheduler token auth (`verify_jwt=false` on deployment), batch limits, image loading, Gemini JSON call, source-sequence validation, idempotent persistence.
3. Reuse the single `ORDER_MASTER_PROMPT`; extend optional scan metadata (`source_message_seq`, `source_line_no`) without changing visible output.
4. Remove legacy heuristic filtering from `v21-order-source` while keeping its read-only/manual endpoint contract.
5. Add RED/GREEN contracts for database, Edge scanner, and pure scan-core behavior; add them to Verify V21.
6. Full Verify V21, merge to `main`, verify Pages, apply migration, deploy exact-main Edge sources, verify source parity and cron registration.

## Safety / idempotency

- Scheduler token is DB-private (RLS + revoke) and never returned to clients.
- `chat_ai_scan_lines` has a unique source-line key to prevent duplicate extraction.
- Cursor only moves forward after finalization.
- Existing history is baseline-only and is not sent to AI.
- A no-order chat is still a successful scan: no lines are inserted, but the cursor advances so it is not rescanned.
