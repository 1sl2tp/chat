-- Repair historical Admin messages that accidentally stored the same image
-- twice in one logical message. Keep the first asset and soft-delete later
-- same-content copies so sync/media history remains auditable.
with ranked as (
  select
    a.id,
    row_number() over(
      partition by a.message_id,a.content_hash
      order by a.sort_index,a.created_at,a.id
    ) as rn
  from public.v21_media_assets a
  join public.v21_messages m on m.id=a.message_id
  join public.v21_accounts s on s.id=m.sender_account_id
  where a.deleted_at is null
    and a.kind='image'
    and a.content_hash is not null
    and s.role='admin'
)
update public.v21_media_assets a
set deleted_at=now(),
    updated_at=now()
from ranked r
where a.id=r.id
  and r.rn>1;
