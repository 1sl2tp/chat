\set ON_ERROR_STOP on
\ir ../../supabase/functions/v21-bank-bill-event/deferred-reread-activation-candidate.sql
-- Reset only isolated fixture queue to establish new pilot behavior.
delete from v0_private.bill_focused_reread;
do $test$
declare rid uuid; j jsonb;
begin
 select id into strict rid from public.chat_bank_bill_receipts;
 if public.v0_bill_focus_mode()<>'off' or public.v0_bill_focus_seed(20)<>0 or public.v0_bill_focus_claim() is not null or v0_private.bill_focus_dispatch() is not null then raise exception 'default_off';end if;
 if has_function_privilege('authenticated','public.v0_bill_focus_mode()','execute') or has_table_privilege('service_role','v0_private.bill_focus_control','update') then raise exception 'activation grant';end if;
 update v0_private.bill_focus_control set mode='pilot';
 if public.v0_bill_focus_seed(20)<>0 then raise exception 'pilot unlisted';end if;
 insert into v0_private.bill_focus_pilot_receipt values(rid);
 update public.chat_bank_bill_receipts set ledger_id=null where id=rid;
 if public.v0_bill_focus_seed(20)<>0 then raise exception 'pilot unsettled';end if;
 update public.chat_bank_bill_receipts set ledger_id=123 where id=rid;
 if public.v0_bill_focus_seed(20)<>2 then raise exception 'pilot eligible';end if;
 update v0_private.bill_focus_control set mode='off';
 if public.v0_bill_focus_claim() is not null then raise exception 'disabled queued claim';end if;
 update v0_private.bill_focus_control set mode='pilot';
 j:=public.v0_bill_focus_claim();
 if j is null or j->>'field'<>'account' then raise exception 'pilot claim';end if;
 if public.v0_bill_focus_claim() is not null then raise exception 'duplicate';end if;
 update v0_private.bill_focus_control set mode='off';
 if v0_private.bill_focus_dispatch() is not null then raise exception 'off dispatch';end if;
 raise notice 'Focused activation default-off, allowlist, settled-only pilot and role checks passed';
end $test$;
