-- ORDER-LINE-382 (2026-11-17): the admin's self-created customer draft
-- Chat notice must show exactly SL × Đơn giá = Thành tiền per saved item.
-- Forward-only, formatter-only: preserves the already deferred message trigger,
-- message identity, product name, notes, order totals, unit-price snapshot,
-- admin recipient, and non-sending rule for admin-created drafts.
-- Applies ONLY to future notices. Never replay/update old Chat messages.
BEGIN;
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
   ' — '||public.taphoa_chat_qty(i.qty)||
   ' × '||public.taphoa_chat_money(i.unit_price_vnd)||
   ' = '||public.taphoa_chat_money(i.qty*i.unit_price_vnd)||
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

-- Keep the formatter private; the existing deferred trigger continues to call it.
REVOKE ALL ON FUNCTION v21_private.taphoa_customer_pending_order_message(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION v21_private.taphoa_customer_pending_order_message(uuid)
  TO service_role;
COMMIT;
