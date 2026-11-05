-- Daily 09:00 Vietnam combined consumer-goods advisory, catalogue-backed.
-- This text function is private, service-only and never promotes tobacco or alcohol.
create or replace function v21_private.taphoa_daily_consultation_text(p_at timestamptz default now())
returns text
language plpgsql
security definer
set search_path='public','v21_private','pg_temp'
as $fn$
declare
 v_sections text[];
 v_n integer;
 v_text text;
begin
 with source as (
  select distinct p.source_key,
   btrim(regexp_replace(extensions.unaccent(replace(p.product_name,'*','')),'[[:space:]]+',' ','g')) as name
  from public.taphoa_products p
  where p.source_key in ('hang-u','hang-thuong')
   and p.is_active=true and p.deleted_at is null
 ),
 filtered as (
  select source_key,name from source
  where not (
    source_key='hang-thuong'
    and lower(name) ~ '^(sua|nuoc sua|bia|ruou) '
  )
 ),
 words as (
  select source_key,name,
    split_part(name,' ',1) w1,
    split_part(name,' ',2) w2,
    split_part(name,' ',3) w3,
    split_part(name,' ',4) w4
  from filtered
 ),
 groups as (
  select source_key,name,
   case
    when source_key='hang-u' and lower(name) ~ '^(bot giat|nuoc giat|xa comfo|xa downy|xa day)' then 1
    when source_key='hang-u' and lower(name) ~ '^(dau goi|dau xa|day )' then 2
    when source_key='hang-u' and lower(name) ~ '^(kem danh rang|lan khu mui|sua tam|rua tay|xa bong|da huong)' then 3
    when source_key='hang-u' and lower(name) ~ '^(gia vi|knor)' then 5
    when source_key='hang-u' then 4
    when source_key='hang-thuong' and lower(name) ~ '^(banh|bim|keo|huong|xx|thach|phong|ruoi) ' then 6
    when source_key='hang-thuong' and lower(name) ~ '^(mi|chao|pho|luong|ngu|rong) ' and lower(name) not like 'mi chinh%' then 7
    when source_key='hang-thuong' and lower(name) ~ '^(nuoc|bo huc)' then 8
    when source_key='hang-thuong' and lower(name) ~ '^(cf|g7) ' then 9
    else 10
   end section,
   case
    when lower(name) like 'kem danh rang %' or lower(name) like 'lan khu mui %'
      then w1||' '||w2||' '||w3||' '||w4
    when lower(name) like 'bot giat %' or lower(name) like 'nuoc giat %'
      or lower(name) like 'dau goi %' or lower(name) like 'dau xa %'
      or lower(name) like 'sua tam %' or lower(name) like 'xa bong %'
      or lower(name) like 'rua bat %' or lower(name) like 'rua tay %'
      then w1||' '||w2||' '||w3
    when lower(name) like 'gia vi - nem knor%' then w1||' '||w2||' '||w3||' '||w4||' '||w5
    when source_key='hang-thuong' and w1 in ('Mam','Duong','Bim','G7','Aj') then w1
    when source_key='hang-u' and lower(name) like 'sun lau %' then w1||' '||w2||' '||w3
    else w1||' '||w2
   end as family
  from (
   select words.*,split_part(name,' ',5) w5 from words
  ) wr
 ),
 variants as (
  select section,family,name,
   nullif(btrim(substr(name,char_length(family)+1)),'') as variant,
   row_number() over (partition by section,family order by name) as rk,
   count(*) over (partition by section,family) as family_n
  from groups
 ),
 merged as (
  select section,family,max(family_n) as n,
   case when max(family_n)=1 then max(name)
    else family||' ('||
      coalesce(string_agg(variant,', ' order by variant) filter(where rk<=3 and variant is not null),'nhieu loai')||
      case when max(family_n)>3 then ', ...' else '' end||')'
   end line
  from variants
  group by section,family
 ),
 blocks as (
  select section,string_agg(line,'; ' order by family) as names
  from merged group by section
 )
 select
  array_agg(coalesce(b.names,'') order by n.idx),
  count(*) filter(where b.names is not null)
 into v_sections,v_n
 from generate_series(1,10) n(idx)
 left join blocks b on b.section=n.idx;

 if v_n < 10 then
  raise exception 'daily_catalogue_sections_missing:%',v_n;
 end if;

 v_text:='🛒 TƯ VẤN NHẬP HÀNG TIÊU DÙNG – 09:00 HẰNG NGÀY'||E'\n\n'||
  'Em chào anh/chị ạ! ❤️'||E'\n\n'||
  'Theo em, cửa hàng nên giữ đủ nhóm hàng phục vụ nhu cầu sinh hoạt và ăn uống thường xuyên, nhưng cân đối quy cách, số lượng theo sức bán để thuận tiện bổ sung và tránh tồn dàn trải.'||E'\n\n'||
  '🧺 HÀNG U – GIẶT GIŨ & NƯỚC XẢ'||E'\n'||v_sections[1]||E'\n\n'||
  '🧴 DẦU GỘI & DẦU XẢ'||E'\n'||v_sections[2]||E'\n\n'||
  '🪥 CHĂM SÓC CÁ NHÂN'||E'\n'||v_sections[3]||E'\n\n'||
  '🧽 VỆ SINH NHÀ CỬA'||E'\n'||v_sections[4]||E'\n\n'||
  '🍲 GIA VỊ NHÓM U'||E'\n'||v_sections[5]||E'\n\n'||
  '🍪 HÀNG THƯỜNG – BÁNH KẸO & ĂN VẶT'||E'\n'||v_sections[6]||E'\n\n'||
  '🍜 MÌ, CHÁO & ĐỒ KHÔ'||E'\n'||v_sections[7]||E'\n\n'||
  '🥤 NƯỚC UỐNG KHÔNG CỒN'||E'\n'||v_sections[8]||E'\n\n'||
  '☕ CÀ PHÊ'||E'\n'||v_sections[9]||E'\n\n'||
  '🍳 GIA VỊ & NGUYÊN LIỆU NẤU ĂN'||E'\n'||v_sections[10]||E'\n\n'||
  '📋 NHÓM THUỐC LÁ: Danh mục kinh doanh có điều kiện được quản lý riêng theo quy định, không thuộc các chương trình khuyến mại của hàng tiêu dùng.'||E'\n\n'||
  '📦 VỀ NGUỒN HÀNG: Anh/chị có thể lựa chọn các nhóm cần bổ sung theo sức bán. Em sẽ kiểm tra tồn thực tế, hạn sử dụng khi cần, khả năng cung ứng và lịch giao trước khi xác nhận đơn; danh mục không đồng nghĩa mọi mã luôn đủ hàng.'||E'\n\n'||
  '🤝 VỀ GIÁ VÀ HỢP TÁC: Em luôn tôn trọng chương trình khuyến mại, trưng bày, chính sách nhà xe, đại lý và nhà phân phối khác. Với hàng tiêu dùng thông thường, anh/chị cứ chủ động báo số lượng, mức giá mong muốn; em sẽ cố gắng tìm phương án tốt nhất có thể trên cùng quy cách và điều kiện giao. Em mong được đồng hành lâu dài bằng sự chân thành và linh hoạt.'||E'\n\n'||
  '❤️ Anh/chị cứ gửi danh sách hàng cần bổ sung cho em nhé. Em cảm ơn anh/chị đã tin tưởng và ủng hộ!';
 if char_length(v_text)>7800 then
  raise exception 'daily_consultation_text_too_long:%',char_length(v_text);
 end if;
 return v_text;
end;
$fn$;

revoke all on function v21_private.taphoa_daily_consultation_text(timestamptz)
from public,anon,authenticated;
grant execute on function v21_private.taphoa_daily_consultation_text(timestamptz)
to service_role;
