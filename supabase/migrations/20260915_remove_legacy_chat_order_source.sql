begin;

-- KH incremental scanning now owns new customer-order ingestion.
-- Remove only the obsolete Chat-side source-state table.
drop table if exists public.chat_order_source_states;

commit;
