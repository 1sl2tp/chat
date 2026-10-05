create or replace function public.v21_zalo_outbound_due_media(
  p_limit integer default 20
) returns table(
  delivery_id uuid,
  chat_message_id uuid,
  chat_account_id uuid,
  zalo_id text,
  body text,
  attempt_count integer,
  thread_type text,
  media jsonb
)
language sql
security definer
set search_path to 'public','v21_private','auth'
as $$
  select
    d.id,d.chat_message_id,d.chat_account_id,d.zalo_id,
    case when d.delivery_part='media' then ''::text else m.body end,
    d.attempt_count,z.thread_type,
    case
      when d.delivery_part='text' then '[]'::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
          'asset_id',a.id,'kind',a.kind,'storage_key',a.storage_key,
          'file_name',a.file_name,'mime_type',a.mime_type,'size_bytes',a.size_bytes,
          'width_px',a.width_px,'height_px',a.height_px,'sort_index',a.sort_index
        ) order by a.sort_index,a.created_at,a.id)
        from public.v21_media_assets a
        where a.message_id=m.id and a.deleted_at is null and a.storage_key is not null
          and a.kind in ('image','audio','file')
      ),'[]'::jsonb)
    end
  from public.zalo_message_links d
  join public.v21_messages m on m.id=d.chat_message_id and m.deleted_at is null
  join public.zalo_user_links l
    on l.chat_account_id=d.chat_account_id and l.zalo_id=d.zalo_id
   and m.created_at>=l.linked_at
  join public.zalo_contacts z on z.zalo_id=d.zalo_id
  where d.direction='outbound'
    and coalesce(d.last_error,'') <> 'expired_cutover_terminal'
    and (
      d.state='pending'
      or (
        d.state='failed' and d.attempt_count<5
        and coalesce(d.last_error,'') <> 'expired_cutover_pending'
        and d.updated_at<=now()-make_interval(secs=>least(300,5*power(2,d.attempt_count)::integer))
      )
    )
    and (
      (d.delivery_part='text' and btrim(coalesce(m.body,''))<>'')
      or (
        d.delivery_part='media' and exists(
          select 1 from public.v21_media_assets a
          where a.message_id=m.id and a.deleted_at is null
            and a.storage_key is not null and a.kind in ('image','audio','file')
        )
      )
      or (
        d.delivery_part='message' and (
          btrim(coalesce(m.body,''))<>''
          or exists(
            select 1 from public.v21_media_assets a
            where a.message_id=m.id and a.deleted_at is null
              and a.storage_key is not null and a.kind in ('image','audio','file')
          )
        )
      )
    )
  order by d.created_at,d.id
  limit greatest(1,least(coalesce(p_limit,20),100));
$$;

update public.zalo_message_links
set last_error='expired_cutover_terminal',
    attempt_count=greatest(attempt_count,5),
    updated_at=now()
where direction='outbound'
  and state='failed'
  and last_error='expired_cutover_pending';

revoke all on function public.v21_zalo_outbound_due_media(integer) from public,anon,authenticated;
grant execute on function public.v21_zalo_outbound_due_media(integer) to service_role;
