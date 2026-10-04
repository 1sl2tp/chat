begin;

-- Final customer-care route rule:
-- Monday + Friday = Milk; every other day = regular goods.
-- The existing 09:15 / 14:00 Vietnam-time scanners and 2-minute staggering
-- remain unchanged.
create or replace function public.chat_customer_care_source_for_date(p_date date)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when extract(isodow from p_date)::int in (1,5)
      then jsonb_build_object(
        'source_key','sua',
        'source_label','Sữa',
        'care_reason','route_day',
        'delivery_day',case extract(isodow from p_date)::int
          when 1 then 'Thứ 2'
          else 'Thứ 6'
        end
      )
    else jsonb_build_object(
      'source_key','hang-thuong',
      'source_label','Hàng thường',
      'care_reason','regular'
    )
  end;
$$;

revoke all on function public.chat_customer_care_source_for_date(date)
  from public,anon,authenticated;
grant execute on function public.chat_customer_care_source_for_date(date)
  to service_role;

-- Rebuild only today's still-open plan under the corrected source rule.
select public.chat_customer_care_refresh(now());

commit;
