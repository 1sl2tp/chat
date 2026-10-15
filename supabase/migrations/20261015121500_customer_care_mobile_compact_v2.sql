-- Further shorten morning product-price comparison message. Message formatter only.
begin;
create or replace function public.chat_customer_care_message(
  p_customer_id uuid,
  p_date date default ((now() at time zone 'Asia/Ho_Chi_Minh')::date)
)
returns jsonb
language plpgsql stable security definer
set search_path to 'public','pg_temp'
as $care$
declare
  v_sales jsonb;
  v_summary text;
  v_body text;
  v_link text := 'https://app.taphoa.xyz/bao-gia/';
  v_source jsonb;
begin
  if p_customer_id is null then raise exception 'customer_required'; end if;
  v_source := public.chat_customer_care_source_for_date(p_date);
  v_sales := public.chat_customer_care_recent_sales(p_date);

  -- Interpret meaningful leading product tokens before generic category words.
  -- Group product display only; preserve every raw SKU in suggestions.
  with sold as (
    select trim(x->>'name') as raw_name, lower(trim(x->>'name')) as lc
    from jsonb_array_elements(v_sales) as e(x)
  ), names as (
    select
      case
        when lc like 'dau sim gao %' then 'dầu Sim gạo'
        when lc like 'dau lan %' then 'dầu Lân'
        when lc like 'dau nep %' then 'dầu Nép'
        when lc like 'dau sim %' then 'dầu Sim'
        when lc like 'dau zan %' then 'dầu ăn'
        when lc like 'dau hao %' then 'dầu hào'
        when lc like 'dau goi %' then 'dầu gội'
        when lc like 'sua tam %' then 'sữa tắm'
        when lc like 'sua chua %' then 'sữa chua'
        when lc like 'sua ha lan %' then 'sữa Hà Lan'
        when lc like 'sua 9 hat%' then 'sữa 9 hạt'
        when lc like 'sua probi %' then 'Probi'
        when lc like 'banh dns %' then 'bánh DNS'
        when lc like 'banh cream %' then 'bánh Cream'
        when lc like 'cf g7 %' or lc like 'g7 %' then 'G7'
        when lc like 'mi chinh %' then 'mì chính'
        when lc like 'mi %' then 'mì ăn liền'
        when lc like 'dam %' then 'dấm'
        when lc like 'bim %' then 'bim bim'
        when lc like 'tuong ot %' then 'tương ớt'
        when lc like 'duong trang %' then 'đường trắng'
        when lc like 'duong vang %' then 'đường vàng'
        when lc like 'xa downy %' then 'xả Downy'
        when lc like 'xa comfo %' then 'xả Comfo'
        when lc like 'sun lau bep%' then 'Sun lau bếp'
        when lc like 'tay vim %' then 'Vim'
        when lc like 'bot giat %' then 'bột giặt'
        when lc like 'nuoc giat %' then 'nước giặt'
        when lc like 'rua bat %' then 'rửa bát'
        else raw_name end as family,
      case
        when lc like 'banh dns %' then substring(raw_name from '([0-9]+)$')
        when lc like 'cf g7 %' then split_part(raw_name,' ',3)
        when lc ~ '^dau (lan|nep|sim|zan) ' then
          replace(substring(raw_name from '([0-9.]+)$'),'.',',')||'L'
        when lc like 'duong trang %' or lc like 'duong vang %' then
          substring(raw_name from '([0-9]+kg)$')
        else null end as variant,
      case
        when lc ~ '^(dau (lan|nep|sim|zan) |duong )' then 1
        when lc like 'sua %' and lc not like 'sua tam %' then 2
        when lc ~ '^(banh |keo |cf |g7 |bim )' then 3
        when lc ~ '^(tuong |mam |muoi |mi chinh |dau hao |dam )' then 4
        else 5 end as sort_order
    from sold
  ), families as (
    select family, min(sort_order) as sort_order,
      case
        when count(variant)=count(*) and count(*)>0 then
          family||' '||string_agg(distinct variant,'/' order by variant)
        else family end as label
    from names group by family
  )
  select string_agg(label,'; ' order by sort_order,family)
  into v_summary from families;

  v_body :=
    '📦 BỔ SUNG HÀNG – '||to_char(p_date,'DD/MM')
    || E'\nAnh/chị xem thử giá bên em, so với nguồn đang nhập nhé (không cần đăng nhập):'
    || E'\n👉 '||v_link
    || case when coalesce(v_summary,'')<>'' then
        E'\n\n🆕 Hàng vừa bán '||to_char(p_date-1,'DD/MM')||'–'||to_char(p_date,'DD/MM')||': '||v_summary
       else '' end
    || E'\n\n⭐ Bên em còn:'
    || E'\n🥛 Sữa: Ensua, Thọ, bò, Probi, Ovantin, Kun, Nuvi.'
    || E'\n🍬 Bánh kẹo/bim bim: Cosy, Tipo, Oreo, Mai, Chew (3V).'
    || E'\n☕ Cà phê: G7, Capu, Sáng Tạo, Birdy, Highland.'
    || E'\n🧂 Gia vị: mắm, mì chính, dấm, dầu hào, hạt nêm'
    || case when exists(
         select 1 from jsonb_array_elements(v_sales) x
         where lower(x->>'name') ~ '^dau (lan|nep|sim|zan) '
       ) then '.' else '; dầu ăn các loại.' end
    || E'\n🧺 Hàng U: giặt/xả, rửa bát, lau tẩy, gội/tắm.'
    || E'\n\nAnh/chị cứ so giá, mã nào cần cân đối thêm thì nhắn tên hàng/quy cách/số lượng, em kiểm tra lại và ghép giao sớm ạ.'
    || E'\n(Không nhận tin nữa, anh/chị nhắn em nhé.)';

  return jsonb_build_object(
    'customer_id',p_customer_id,
    'business_date',p_date,
    'source_key',v_source->>'source_key',
    'source_label',v_source->>'source_label',
    'suggestion_basis','short_price_compare_prefix_groups_v2',
    'suggestions',v_sales,
    'body',v_body,
    'link',v_link
  );
end;
$care$;
revoke all on function public.chat_customer_care_message(uuid,date)
from public,anon,authenticated;
grant execute on function public.chat_customer_care_message(uuid,date) to service_role;
commit;
