-- Weekly milk consultation: fixed destination, verified sender and idempotent delivery.
-- Business-authorized service scheduler. No client-facing permissions.
create or replace function v21_private.taphoa_milk_consultation_text(p_at timestamptz default now())
returns text
language plpgsql
security definer
set search_path = 'public', 'v21_private', 'pg_temp'
as $function$
declare
  v_drink text;
  v_yogurt text;
  v_condensed text;
  v_local timestamp := p_at at time zone 'Asia/Ho_Chi_Minh';
  v_intro text;
  v_body text;
begin
  with source as (
    select distinct btrim(extensions.unaccent(p.product_name)) as name
    from public.taphoa_products p
    where p.is_active = true and p.deleted_at is null
      and (
        p.source_key = 'sua'
        or (
          p.source_key = 'hang-thuong'
          and (
            extensions.unaccent(p.product_name) ilike 'Sua %'
            or extensions.unaccent(p.product_name) ilike 'Nuoc sua %'
          )
        )
      )
      and lower(extensions.unaccent(p.product_name)) not like 'sua tam%'
      and lower(extensions.unaccent(p.product_name)) not like '%ca phe sua%'
      and char_length(btrim(p.product_name)) > 3
  ),
  mapping(prefix, priority) as (
    values
      ('Sua bo be',10),('Sua bo to',11),('Sua bo bich',12),('Sua bo lit',13),
      ('Sua 9 hat',14),
      ('Sua green fram be 110ml',15),('Sua green fram to 180ml',16),('Sua green fram',17),
      ('Sua ha lan be',18),('Sua ha lan to',19),('Sua ha lan',20),
      ('Sua th',21),('Sua fami',22),('Sua milo be',23),('Sua milo to',24),
      ('Sua milo',25),('Sua kun be',26),('Sua kun to',27),('Sua gau',28),
      ('Sua moc be',29),('Sua moc to',30),('Sua nuvi be',31),('Sua nuvi to',32),
      ('Sua ovantin be',33),('Sua ovantin to',34),
      ('Sua chua nha dam',50),('Sua chua',51),
      ('Sua probi be',52),('Sua probi to',53),('Sua probi lo',54),
      ('Sua su lo',55),('Sua su vi',56),
      ('Sua tho do giay',70),('Sua tho',71),('Sua ngoi sao',72),
      ('Sua dac tai loc',73),('Sua ensua',74)
  ),
  normalized as (
    select s.name,
      coalesce(m.prefix,s.name) as label,
      m.priority,
      case when m.prefix is null then null
        else nullif(
          btrim(regexp_replace(
            btrim(substr(s.name,char_length(m.prefix)+1)),
            '^mau[[:space:]]*-[[:space:]]*','','i'
          )), '')
      end as variant,
      case
        when lower(s.name) like 'sua tho%' or lower(s.name) like 'sua ngoi sao%'
          or lower(s.name) like 'sua ensua%' or lower(s.name) like 'sua dac tai loc%'
          then 3
        when lower(s.name) like 'sua chua%' or lower(s.name) like 'sua probi%'
          or lower(s.name) like 'sua su%' or lower(s.name) like 'nuoc sua chua%'
          or lower(s.name) like 'sua yomost%' or lower(s.name) like 'sua yogood%'
          then 2
        else 1
      end as section
    from source s
    left join lateral (
      select prefix, priority from mapping m
      where lower(s.name)=lower(m.prefix)
        or lower(s.name) like lower(m.prefix) || ' %'
      order by char_length(m.prefix) desc
      limit 1
    ) m on true
  ),
  grouped as (
    select label,section,min(priority) priority,
      case when count(*)=1 and max(variant) is null then label
        when bool_or(variant is null) then
          label || ' (thuong' ||
          coalesce(', ' || string_agg(variant,', ' order by variant)
            filter(where variant is not null),'') || ')'
        else label || ' (' || string_agg(variant,', ' order by variant) || ')'
      end as line
    from normalized
    group by label,section
  ),
  blocks as (
    select section, string_agg('- ' || line, E'\n' order by priority nulls last,label) as lines
    from grouped group by section
  )
  select max(lines) filter(where section=1),
    max(lines) filter(where section=2),
    max(lines) filter(where section=3)
  into v_drink,v_yogurt,v_condensed
  from blocks;

  if v_drink is null or v_yogurt is null or v_condensed is null then
    raise exception 'milk_catalogue_incomplete';
  end if;

  if extract(isodow from v_local) = 1 then
    v_intro := 'Đầu tuần, em xin chia sẻ các dòng sữa để anh/chị tham khảo, lựa chọn và lên kế hoạch bổ sung cho cửa hàng.';
  else
    v_intro := 'Cuối tuần, em xin chia sẻ các dòng sữa để anh/chị tiện gom đơn và bổ sung theo sức bán của cửa hàng.';
  end if;

  v_body :=
    '🥛 TƯ VẤN NHẬP SỮA – THỨ 2 & THỨ 6' || E'\n\n' ||
    'Em chào anh/chị ạ! ❤️' || E'\n\n' ||
    v_intro || E'\n\n' ||
    'Sữa là nhóm thực phẩm nhiều gia đình dùng thường xuyên. Tùy nhu cầu, khách có thể chọn sữa uống theo cỡ và độ ngọt, sữa chua theo vị hoặc sữa đặc cho pha chế. Cửa hàng nên cân đối loại, quy cách và nhịp bổ sung theo sức bán thực tế.' || E'\n\n' ||
    '🥛 SỮA UỐNG – NHIỀU CỠ VÀ LỰA CHỌN' || E'\n' || v_drink || E'\n\n' ||
    '🥛 SỮA CHUA & SỮA UỐNG LÊN MEN' || E'\n' || v_yogurt || E'\n\n' ||
    '🥛 SỮA ĐẶC – PHA CHẾ & CHẾ BIẾN' || E'\n' || v_condensed || E'\n\n' ||
    '📦 VỀ NHẬP HÀNG: Mỗi cửa hàng có nhu cầu riêng. Anh/chị có thể ưu tiên những dòng khách thường hỏi và bổ sung theo mức bán. Em sẽ kiểm tra tồn thực tế, khả năng cung ứng, hạn sử dụng và lịch giao trước khi chốt; không muốn hứa hàng luôn đủ khi chưa kiểm tra.' || E'\n\n' ||
    '🤝 VỀ GIÁ & HỢP TÁC: Em luôn tôn trọng chương trình khuyến mại của hãng, trưng bày, nhà xe, đại lý và các đơn vị phân phối khác. Anh/chị cứ chủ động gửi số lượng và mức giá mong muốn; em sẽ cố gắng cân đối để hỗ trợ mức giá và điều kiện tốt nhất có thể. Em mong hợp tác bằng sự chân thành, linh hoạt và lâu dài, không so sánh gây mất lòng đơn vị nào.' || E'\n\n' ||
    '📅 Thứ 2 và thứ 6 là hai nhịp tư vấn, hỗ trợ mua thử công nợ trong tuần. Giá và điều kiện công nợ cụ thể được xác nhận khi chốt đơn.' || E'\n\n' ||
    '❤️ Anh/chị cần dòng nào cứ gửi danh sách, số lượng và mức giá mong muốn cho em nhé. Em cảm ơn anh/chị!';

  if char_length(v_body) > 7800 then
    raise exception 'milk_advisory_body_too_long';
  end if;
  return v_body;
end;
$function$;

create or replace function v21_private.taphoa_milk_consultation_dispatch(
  p_test boolean default false, p_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'v21_private', 'pg_temp'
as $function$
declare
  v_local timestamp := p_at at time zone 'Asia/Ho_Chi_Minh';
  v_date text := to_char(p_at at time zone 'Asia/Ho_Chi_Minh','YYYYMMDD');
  v_sender uuid;
  v_recipient uuid;
  v_conversation uuid;
  v_message uuid;
  v_text text;
  v_client_id text;
  v_zalo_id text;
  v_state text;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('milk-advisory:' || v_date,0)) then
    return jsonb_build_object('ok',true,'status','busy');
  end if;

  -- The scheduler runs on GMT; 23:00 Sun/Thu is 06:00 Mon/Fri in Vietnam.
  if not p_test and (
    extract(isodow from v_local) not in (1,5)
    or v_local::time < time '06:00' or v_local::time >= time '06:30'
  ) then
    return jsonb_build_object('ok',true,'status','outside_window');
  end if;

  -- Fixed, admin-authorized Zalo destination; resolve live IDs from current links.
  select l.linked_by_account_id, l.chat_account_id, z.zalo_id
  into v_sender,v_recipient,v_zalo_id
  from public.zalo_contacts z
  join public.zalo_user_links l on l.zalo_id=z.zalo_id
  join public.v21_accounts a on a.id=l.linked_by_account_id
  join public.v21_accounts t on t.id=l.chat_account_id
  where z.display_name='Báo Giá - 0911479555'
    and z.thread_type='group'
    and a.role='admin' and a.deleted_at is null and a.locked_at is null
    and t.role='user' and t.deleted_at is null and t.locked_at is null
  order by l.linked_at desc
  limit 1;

  if v_sender is null or v_recipient is null then
    return jsonb_build_object('ok',false,'status','group_link_missing');
  end if;

  if p_test then
    select id into v_recipient
    from public.v21_accounts
    where username='test' and role='user'
      and deleted_at is null and locked_at is null
    limit 1;
    if v_recipient is null then
      return jsonb_build_object('ok',false,'status','test_account_missing');
    end if;
  end if;

  select c.id into v_conversation
  from public.v21_conversations c
  where (c.member_a=v_sender and c.member_b=v_recipient)
    or (c.member_b=v_sender and c.member_a=v_recipient)
  order by c.created_at desc limit 1;

  if v_conversation is null then
    return jsonb_build_object('ok',false,'status','conversation_missing');
  end if;

  v_client_id := 'advisory:milk:' || case when p_test then 'test:' else 'group:' end || v_date;
  v_text := v21_private.taphoa_milk_consultation_text(p_at);
  if p_test then
    v_text := '[TIN THỬ NỘI BỘ - test]' || E'\n\n' || v_text;
  end if;

  insert into public.v21_messages (conversation_id,sender_account_id,client_id,body)
  values (v_conversation,v_sender,v_client_id,v_text)
  on conflict on constraint v21_messages_sender_account_id_client_id_key
  do nothing
  returning id into v_message;

  if v_message is null then
    select id into v_message from public.v21_messages
    where sender_account_id=v_sender and client_id=v_client_id
      and conversation_id=v_conversation and deleted_at is null
    limit 1;
    if v_message is null then
      return jsonb_build_object('ok',false,'status','idempotency_conflict');
    end if;
  end if;

  if p_test then
    return jsonb_build_object('ok',true,'status','chat_test_created','message_id',v_message);
  end if;

  select state into v_state from public.zalo_message_links
  where chat_message_id=v_message and zalo_id=v_zalo_id
    and direction='outbound' order by created_at desc limit 1;

  if v_state is null then
    raise exception 'milk_advisory_zalo_outbox_missing';
  end if;

  return jsonb_build_object(
    'ok',true,'status',v_state,'message_id',v_message,
    'recipient','Báo Giá - 0911479555','local_date',v_date
  );
end;
$function$;

revoke all on function v21_private.taphoa_milk_consultation_text(timestamptz) from public, anon, authenticated;
revoke all on function v21_private.taphoa_milk_consultation_dispatch(boolean,timestamptz) from public, anon, authenticated;
grant execute on function v21_private.taphoa_milk_consultation_text(timestamptz) to service_role;
grant execute on function v21_private.taphoa_milk_consultation_dispatch(boolean,timestamptz) to service_role;
comment on function v21_private.taphoa_milk_consultation_dispatch(boolean,timestamptz)
is 'Narrow service-only weekly milk consultation; scheduler dispatch to one verified group, test mode targets only test; UNIQUE client ID prevents duplicates.';
