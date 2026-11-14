-- NCC-005 READ-ONLY activation preflight. No DDL, no data writes, no secrets.
-- Run against the intended Supabase project BEFORE any managed migration/Edge release.
-- The SQL verifies only schema prerequisites, not API tokens or environment values.
with checks as (
 select 'core_account_group_supports_ncc' as gate,
  exists(select 1 from pg_constraint
    where conrelid='public.v21_accounts'::regclass
      and pg_get_constraintdef(oid) like '%ncc%') as ready
 union all select 'invoice_table',to_regclass('public.chat_ncc_invoices') is not null
 union all select 'lines_table',to_regclass('public.chat_ncc_invoice_lines') is not null
 union all select 'alias_table',to_regclass('public.chat_ncc_product_aliases') is not null
 union all select 'scanner_table',to_regclass('public.chat_ncc_scanner_assignments') is not null
 union all select 'media_bucket',
  exists(select 1 from storage.buckets where id='v21-media')
 union all select 'pg_net',
  exists(select 1 from pg_extension where extname='pg_net')
 union all select 'vault',
  exists(select 1 from pg_extension where extname='supabase_vault')
 union all select 'intake_trigger',
  exists(select 1 from pg_trigger
   where tgname='chat_ncc_media_received' and not tgisinternal)
 union all select 'webhook_trigger',
  exists(select 1 from pg_trigger
   where tgname='chat_ncc_auto_scan_on_receipt' and not tgisinternal)
 union all select 'invoice_rls',
  exists(select 1 from pg_class
   where oid=to_regclass('public.chat_ncc_invoices') and relrowsecurity)
)
select gate, ready, case when ready then 'READY' else 'BLOCKED' end as status
from checks order by gate;
