-- ORDER-NOTICE-242: Fill the admin-only customer-created draft notice with
-- the committed order lines. Deferred trigger runs after the canonical
-- order-save RPC has inserted all lines; no new polling or client API.
create or replace function v21_private.taphoa_customer_pending_order_message(p_order_id uuid)
returns text
language plpgsql security definer
set search_path='public','v21_private','pg_temp'
as $fn$
declare
 v_order public.taphoa_orders%rowtype;
 v_customer_name text;
 v_lines text;
 v_line_count integer;
 v_qty numeric;
 v_total numeric;
 v_note text;
 v_message text;
begin
 select * into v_order from public.taphoa_orders where id=p_order_id;
 if not found or v_order.status<>'pending'
   or v_order.created_by_account_id is distinct from v_order.customer_account_id
 then return null; end if;
 select left(regexp_replace(coalesce(a.display_name,a.username),
         '[[:cntrl:]]+',' ','g'),100)
 into v_customer_name
 from public.v21_accounts a
 where a.id=v_order.customer_account_id
   and a.role='user' and a.contact_group='customer'
   and a.deleted_at is null and a.locked_at is null;
 if v_customer_name is null then return null; end if;

 select count(*)::integer,coalesce(sum(i.qty),0),
   coalesce(sum(i.qty*i.unit_price_vnd),0)
 into v_line_count,v_qty,v_total
 from public.taphoa_order_items i where i.order_id=p_order_id;
 if v_line_count=0 then return null; end if;

 select string_agg(
   '• '||left(regexp_replace(coalesce(p.product_name,i.product_code),
           '[[:cntrl:]]+',' ','g'),90)||
   ' × '||public.taphoa_chat_qty(i.qty)||
   ' · '||public.taphoa_chat_money(i.qty*i.unit_price_vnd)||
   case when nullif(btrim(i.note),'') is not null then
      ' ('||left(regexp_replace(i.note,'[[:cntrl:]]+',' ','g'),65)||')'
     else '' end,
   E'\n' order by i.line_no,i.id
 ) into v_lines
 from (
  select * from public.taphoa_order_items
  where order_id=p_order_id order by line_no,id limit 35
 ) i
 left join public.taphoa_products p on p.product_code=i.product_code;

 v_note:=nullif(left(regexp_replace(coalesce(v_order.note,''),
                    '[[:cntrl:]]+',' ','g'),160),'');
 v_message :=
  '🛒 KHÁCH TỰ TẠO ĐƠN TẠM'||E'\n'||
  '👤 '||v_customer_name||E'\n'||
  '🧾 '||coalesce(v_order.display_prefix,'DT')||
              coalesce(v_order.display_no::text,'')||E'\n'||
  '🕒 '||to_char(v_order.created_at at time zone 'Asia/Ho_Chi_Minh',
               'DD/MM/YYYY HH24:MI')||' (VN)'||E'\n\n'||
  '📦 SẢN PHẨM KHÁCH ĐẶT:'||E'\n'||coalesce(v_lines,'')||
  case when v_line_count>35 then E'\n'||
    '… còn '||(v_line_count-35)::text||' dòng, xem trong đơn' else '' end||E'\n\n'||
  '📊 '||v_line_count||' mã · '||public.taphoa_chat_qty(v_qty)||
  ' sản phẩm'||E'\n'||
  '💰 Tạm tính: '||public.taphoa_chat_money(v_total)||
  case when v_note is not null then E'\n'||
    '📝 Ghi chú: '||v_note else '' end||E'\n'||
  '⏳ Chờ quản trị viên xử lý'||E'\n'||
  '🔎 Xem Đơn tạm: https://app.taphoa.xyz/#/tab/tab-don-tam';
 if char_length(v_message)>7900 then
   v_message:=left(v_message,7600)||E'\n'||
   '🔎 Xem đầy đủ trong Đơn tạm: https://app.taphoa.xyz/#/tab/tab-don-tam';
 end if;
 return v_message;
end;
$fn$;

create or replace function v21_private.taphoa_notify_customer_created_draft()
returns trigger
language plpgsql security definer
set search_path='public','v21_private','pg_temp'
as $fn$
declare
 v_admin uuid;
 v_bot uuid;
 v_conv uuid;
 v_body text;
begin
 -- Recheck the final persisted state at transaction commit. New orders only.
 if NEW.status<>'pending'
   or NEW.created_by_account_id is distinct from NEW.customer_account_id
 then return NEW; end if;

 v_body:=v21_private.taphoa_customer_pending_order_message(NEW.id);
 if v_body is null then return NEW; end if;

 select id into v_admin from public.v21_accounts
 where username='admin' and role='admin'
   and deleted_at is null and locked_at is null limit 1;
 select id into v_bot from public.v21_accounts
 where username='taphoa_don_khach' and role='user'
   and deleted_at is null and locked_at is null limit 1;
 if v_admin is null or v_bot is null then return NEW; end if;
 select id into v_conv from public.v21_conversations
 where member_a=v_admin and member_b=v_bot limit 1;
 if v_conv is null then return NEW; end if;

 insert into public.v21_messages(
   conversation_id,sender_account_id,client_id,body
 ) values(
   v_conv,v_bot,'taphoa:customer-draft:'||NEW.id::text,v_body
 )
 on conflict on constraint v21_messages_sender_account_id_client_id_key
 do nothing;
 return NEW;
exception when others then
 -- Do not break creation of a valid customer order for a notification failure.
 raise warning 'taphoa_customer_draft_notice_failed order=% state=%',NEW.id,SQLSTATE;
 return NEW;
end;
$fn$;

drop trigger if exists taphoa_notify_customer_created_draft_trg on public.taphoa_orders;
create constraint trigger taphoa_notify_customer_created_draft_trg
after insert on public.taphoa_orders
deferrable initially deferred
for each row execute function v21_private.taphoa_notify_customer_created_draft();

revoke all on function v21_private.taphoa_customer_pending_order_message(uuid)
from public,anon,authenticated;
revoke all on function v21_private.taphoa_notify_customer_created_draft()
from public,anon,authenticated;
grant execute on function v21_private.taphoa_customer_pending_order_message(uuid)
to service_role;

comment on trigger taphoa_notify_customer_created_draft_trg on public.taphoa_orders is
'Deferred Admin-only self-created customer pending order notice with full committed line details; admin-created excluded.';
