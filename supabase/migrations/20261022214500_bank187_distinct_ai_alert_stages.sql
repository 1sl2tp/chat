-- BANK-187: separate transient AI alerts from final Admin-action alerts.
-- Never suppress final errors because an earlier "retry scheduled" push exists.
create or replace function v21_private.chat_bank_admin_push_on_receipt()
returns trigger language plpgsql security definer
set search_path=public,v21_private,pg_temp
as $function$
declare
  v_kind text;
  v_day date;
  v_username text;
  v_key text;
begin
 if TG_OP='UPDATE' and old.status is not distinct from new.status then return new; end if;
 if new.status not in ('amount_read','review','duplicate','failed') then return new; end if;
 select username into v_username from public.v21_accounts where id=new.customer_account_id;
 if lower(coalesce(v_username,''))='test' then return new; end if;
 if exists(select 1 from public.chat_bank_app_collection_links l where l.receipt_id=new.id)
 then return new; end if;
 v_day:=(new.sent_at at time zone 'Asia/Ho_Chi_Minh')::date;
 v_kind:=case
  when new.status='amount_read' and new.amount_vnd>0
    and new.transfer_at_vn is not null and new.transfer_at_vn::date=v_day
  then 'bill_waiting' else 'review' end;
 v_key:=case
   when new.status='failed' then 'review:ai-retrying:'||new.id::text
   when new.status='review' and new.reason ~* '^(amount_scan_|ai_scan_)'
     then 'review:ai-attention:'||new.id::text
   else v_kind||':'||new.id::text end;
 perform v21_private.chat_bank_admin_push_enqueue(v_kind,v_key,null,new.id,v_day);
 return new;
end
$function$;
revoke all on function v21_private.chat_bank_admin_push_on_receipt() from public,anon,authenticated;
