-- UI-250: Two former automated advisory schedules are disabled.
-- This migration preserves their history, installs the manually-triggered
-- single-group admin-only RPC and does not schedule any new send.
DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='taphoa-milk-advisory-0600-vn') THEN
    PERFORM cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname='taphoa-milk-advisory-0600-vn'),active := false);
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='taphoa-daily-advisory-0900-vn') THEN
    PERFORM cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname='taphoa-daily-advisory-0900-vn'),active := false);
  END IF;
END;
$schedule$;

CREATE OR REPLACE FUNCTION v21_private.taphoa_manual_advisory_text(p_kind text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
declare
  v_title text;
  v_intro text;
  v_lines text;
  v_body text;
begin
  if p_kind not in ('milk','hang-thuong','hang-u') then
    raise exception 'advisory_kind_invalid' using errcode='22023';
  end if;
  case p_kind
    when 'milk' then
      v_title:='🥛 TƯ VẤN SỮA';
      v_intro:='Các dòng sữa tham khảo theo nhu cầu khách mua:';
    when 'hang-thuong' then
      v_title:='🛒 TƯ VẤN HÀNG THƯỜNG';
      v_intro:='Các nhóm hàng tiêu dùng tham khảo để bổ sung theo sức bán:';
    else
      v_title:='🧺 TƯ VẤN HÀNG U';
      v_intro:='Các nhóm chăm sóc gia đình và vệ sinh tham khảo:';
  end case;
  with items as (
    select distinct
      left(btrim(regexp_replace(p.product_name,'[[:space:]]+',' ','g')),75) as name,
      lower(extensions.unaccent(p.product_name)) as normalized
    from public.taphoa_products p
    where p.is_active=true and p.deleted_at is null
      and char_length(btrim(p.product_name)) between 4 and 180
      and (
        (p_kind='milk' and (p.source_key='sua' or
           (p.source_key='hang-thuong' and lower(extensions.unaccent(p.product_name)) ~ '^(sua|nuoc sua) ')))
        or (p_kind='hang-thuong' and p.source_key='hang-thuong'
           and lower(extensions.unaccent(p.product_name)) !~ '^(sua|nuoc sua) ')
        or (p_kind='hang-u' and p.source_key='hang-u')
      )
      and lower(extensions.unaccent(p.product_name)) !~ '^(bia|ruou|thuoc la|thuoc|cigar|vape|pod|nicotine) '
      and (p_kind<>'milk' or lower(extensions.unaccent(p.product_name)) not like 'sua tam%')
  ),
  classified as (
    select name,
      case
        when p_kind='milk' then
          case when normalized ~ '^(sua chua|nuoc sua chua|sua probi|sua su)' then 2
               when normalized ~ '^(sua tho|sua dac|sua ngoi sao|sua ensua)' then 3 else 1 end
        when p_kind='hang-u' then
          case when normalized ~ '^(bot giat|nuoc giat|xa )' then 1
               when normalized ~ '^(dau goi|dau xa|kem danh rang|sua tam|lan khu mui)' then 2
               when normalized ~ '^(rua|sun lau|xa bong)' then 3 else 4 end
        else
          case when normalized ~ '^(banh|bim|keo|thach)' then 1
               when normalized ~ '^(mi |chao |pho |ngu coc)' then 2
               when normalized ~ '^(nuoc |bo huc|cf |g7 )' then 3 else 4 end
      end as group_no
    from items
  ), ranked as (
    select name,group_no,
      row_number() over(partition by group_no order by lower(name),name) as rn
    from classified
  )
  select string_agg('- '||name,E'\n' order by group_no,name)
  into v_lines
  from ranked where rn<=3;
  if nullif(v_lines,'') is null then
    raise exception 'advisory_catalogue_empty' using errcode='22023';
  end if;
  v_body := v_title || E'\n\n'
    || 'Em chào anh/chị ạ! ❤️' || E'\n'
    || v_intro || E'\n'
    || v_lines || E'\n\n'
    || '📦 Danh mục để tham khảo; tồn kho, giá, quy cách, hạn sử dụng và lịch giao sẽ được kiểm tra trước khi chốt đơn.' || E'\n'
    || '🤝 Anh/chị cứ gửi nhu cầu, số lượng và mức giá mong muốn. Em sẽ cố gắng hỗ trợ phù hợp ạ!';
  if char_length(v_body)>1400 then
    raise exception 'advisory_message_too_long' using errcode='22023';
  end if;
  return v_body;
end;
$function$


CREATE OR REPLACE FUNCTION public.chat_admin_manual_advisory(p_contact_id uuid, p_kind text, p_command_id uuid DEFAULT NULL::uuid, p_send boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
declare
  v_actor uuid := v21_private.current_active_account_id();
  v_sender uuid;
  v_receiver uuid;
  v_zalo text;
  v_conversation uuid;
  v_body text;
  v_client text;
  v_message uuid;
  v_outbox text;
  v_existing_body text;
  v_new boolean := false;
begin
  if v_actor is null or not exists (
    select 1 from public.v21_accounts a
    where a.id=v_actor and a.role='admin'
      and a.deleted_at is null and a.locked_at is null
  ) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_contact_id is null or p_kind not in ('milk','hang-thuong','hang-u') then
    raise exception 'invalid_target_or_kind' using errcode='22023';
  end if;
  select l.linked_by_account_id,l.chat_account_id,z.zalo_id
    into v_sender,v_receiver,v_zalo
  from public.zalo_contacts z
  join public.zalo_user_links l on l.zalo_id=z.zalo_id
  join public.v21_accounts target on target.id=l.chat_account_id
  where z.display_name='Báo Giá - 0911479555' and z.thread_type='group'
    and l.linked_by_account_id=v_actor
    and l.chat_account_id=p_contact_id
    and target.role='user' and target.deleted_at is null and target.locked_at is null
  order by l.linked_at desc limit 1;
  if v_sender is null or v_receiver is null then
    raise exception 'advisory_destination_not_verified' using errcode='42501';
  end if;
  select c.id into v_conversation from public.v21_conversations c
  where (c.member_a=v_sender and c.member_b=v_receiver)
     or (c.member_b=v_sender and c.member_a=v_receiver)
  order by c.created_at desc limit 1;
  if v_conversation is null then
    raise exception 'advisory_conversation_missing' using errcode='22023';
  end if;
  v_body:=v21_private.taphoa_manual_advisory_text(p_kind);
  if not p_send then
    return jsonb_build_object(
      'ok',true,'preview',true,'kind',p_kind,'contact_id',p_contact_id,
      'body',v_body,'length',char_length(v_body)
    );
  end if;
  if p_command_id is null then
    raise exception 'manual_confirmation_id_required' using errcode='22023';
  end if;
  v_client:='manual-advice:'||p_kind||':'||p_command_id::text;
  perform pg_advisory_xact_lock(hashtextextended(v_client,0));
  select id,body into v_message,v_existing_body
  from public.v21_messages
  where sender_account_id=v_sender and client_id=v_client
    and conversation_id=v_conversation and deleted_at is null
  limit 1;
  if v_message is null then
    insert into public.v21_messages(conversation_id,sender_account_id,client_id,body)
    values(v_conversation,v_sender,v_client,v_body)
    on conflict on constraint v21_messages_sender_account_id_client_id_key
    do nothing returning id into v_message;
    v_new:=v_message is not null;
  end if;
  if v_message is null then
    raise exception 'advisory_command_conflict' using errcode='23505';
  end if;
  select state into v_outbox
  from public.zalo_message_links
  where chat_message_id=v_message and direction='outbound' and zalo_id=v_zalo
  order by created_at desc limit 1;
  if v_outbox is null then
    raise exception 'advisory_outbound_link_missing';
  end if;
  return jsonb_build_object(
    'ok',true,'preview',false,'kind',p_kind,'contact_id',p_contact_id,
    'message_id',v_message,'status',v_outbox,'created',v_new
  );
end;
$function$


revoke all on function v21_private.taphoa_manual_advisory_text(text) from public,anon,authenticated;
grant execute on function v21_private.taphoa_manual_advisory_text(text) to service_role;
revoke all on function public.chat_admin_manual_advisory(uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.chat_admin_manual_advisory(uuid,text,uuid,boolean) to authenticated;
