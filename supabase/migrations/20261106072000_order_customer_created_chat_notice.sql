-- ORDER-NOTICE-241: alert admin in TAPHOA Chat only when a logged-in
-- customer creates a new temporary order. Reuse canonical chat message
-- sync/unread/push; no new polling, transport or unauthenticated RPC.
do $setup$
declare
  v_bot uuid;
  v_admin uuid;
  v_conv uuid;
begin
  select id into v_bot from public.v21_accounts
    where username='taphoa_don_khach' and deleted_at is null limit 1;

  if v_bot is null then
    insert into public.v21_accounts
      (username,display_name,role,contact_group)
    values
      ('taphoa_don_khach','TAPHOA · Đơn khách tự đặt','user','other')
    returning id into v_bot;
  end if;

  select id into v_admin from public.v21_accounts
    where username='admin' and role='admin'
      and deleted_at is null and locked_at is null limit 1;
  if v_admin is null then
    raise exception 'order_notify_admin_missing';
  end if;

  select id into v_conv from public.v21_conversations
    where member_a=v_admin and member_b=v_bot limit 1;

  if v_conv is null then
    insert into public.v21_conversations(member_a,member_b)
    values(v_admin,v_bot)
    on conflict (member_a,member_b) do nothing
    returning id into v_conv;
  end if;
  if v_conv is null then
    select id into v_conv from public.v21_conversations
      where member_a=v_admin and member_b=v_bot limit 1;
  end if;
  if v_conv is null then raise exception 'order_notify_conversation_missing'; end if;

  -- One calm setup message to make the new system channel discoverable.
  insert into public.v21_messages
    (conversation_id,sender_account_id,client_id,body)
  values(
    v_conv,v_bot,'taphoa:customer-draft:enabled:20261106',
    '🔔 THÔNG BÁO ĐƠN KHÁCH TỰ ĐẶT'||E'\n'||
    'Kênh này báo cho quản trị viên khi khách đăng nhập tự tạo đơn tạm.'||E'\n'||
    '• Mỗi đơn mới chỉ báo một lần.'||E'\n'||
    '• Đơn do admin tạo hộ không phát thông báo.'||E'\n'||
    '• Không tự giao hàng, xác nhận đơn hoặc thay đổi công nợ.'||E'\n'||
    '📦 Xem Đơn tạm: https://app.taphoa.xyz/#/tab/tab-don-tam'
  )
  on conflict on constraint v21_messages_sender_account_id_client_id_key
  do nothing;
end;
$setup$;

create or replace function v21_private.taphoa_notify_customer_created_draft()
returns trigger
language plpgsql
security definer
set search_path='public','v21_private','pg_temp'
as $function$
declare
  v_admin uuid;
  v_bot uuid;
  v_conv uuid;
  v_name text;
  v_order_label text;
  v_message text;
begin
  -- Only a NEW pending draft truly created by its customer.
  -- Admin-created drafts are excluded, even if they belong to that customer.
  if NEW.status<>'pending'
    or NEW.created_by_account_id is distinct from NEW.customer_account_id
  then
    return NEW;
  end if;

  select left(regexp_replace(coalesce(display_name,username),'[[:cntrl:]]+',' ','g'),100)
  into v_name
  from public.v21_accounts
  where id=NEW.customer_account_id and role='user'
    and contact_group='customer' and deleted_at is null and locked_at is null;
  if v_name is null then return NEW; end if;

  select id into v_admin from public.v21_accounts
   where username='admin' and role='admin'
     and deleted_at is null and locked_at is null limit 1;
  select id into v_bot from public.v21_accounts
   where username='taphoa_don_khach' and role='user'
     and deleted_at is null and locked_at is null limit 1;
  if v_admin is null or v_bot is null then
    raise warning 'taphoa_order_notify_missing_bot_or_admin for order %',NEW.id;
    return NEW;
  end if;
  select id into v_conv from public.v21_conversations
   where member_a=v_admin and member_b=v_bot limit 1;
  if v_conv is null then
    raise warning 'taphoa_order_notify_missing_conversation for order %',NEW.id;
    return NEW;
  end if;

  v_order_label:=coalesce(NEW.display_prefix,'DT')||
                 coalesce(NEW.display_no::text,' (chưa có số)');
  v_message:='🛒 KHÁCH TỰ TẠO ĐƠN TẠM'||E'\n'||
    '👤 Khách: '||v_name||E'\n'||
    '🧾 Mã đơn: '||v_order_label||E'\n'||
    '🕒 '||to_char(NEW.created_at at time zone 'Asia/Ho_Chi_Minh',
       'DD/MM/YYYY HH24:MI')||' (VN)'||E'\n'||
    '📌 Đơn đang chờ quản trị viên xem và xử lý.'||E'\n'||
    '🔎 Xem Đơn tạm: https://app.taphoa.xyz/#/tab/tab-don-tam';

  insert into public.v21_messages
    (conversation_id,sender_account_id,client_id,body)
  values(v_conv,v_bot,'taphoa:customer-draft:'||NEW.id::text,v_message)
  on conflict on constraint v21_messages_sender_account_id_client_id_key
  do nothing;
  return NEW;
exception when others then
  -- A notification fault must never cancel a legitimate customer's order.
  raise warning 'taphoa_customer_draft_notify_failed order=% SQLSTATE=%',
    NEW.id,SQLSTATE;
  return NEW;
end;
$function$;

revoke all on function v21_private.taphoa_notify_customer_created_draft()
from public,anon,authenticated;

drop trigger if exists taphoa_notify_customer_created_draft_trg
on public.taphoa_orders;

create trigger taphoa_notify_customer_created_draft_trg
after insert on public.taphoa_orders
for each row
execute function v21_private.taphoa_notify_customer_created_draft();

comment on trigger taphoa_notify_customer_created_draft_trg
on public.taphoa_orders is
'Admin Chat notification only for new pending orders created by the logged-in customer; no admin-created or update notifications.';
