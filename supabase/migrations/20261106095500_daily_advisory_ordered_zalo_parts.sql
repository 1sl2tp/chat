-- One article each day; send full text as sequenced Zalo-sized parts.
-- Supabase cron uses UTC. Business time is Asia/Ho_Chi_Minh.
create table if not exists v21_private.taphoa_daily_advice_batches (
  business_date date primary key,
  sender_id uuid not null,
  receiver_id uuid not null,
  zalo_id text not null,
  body text not null,
  parts text[] not null,
  created_at timestamptz not null default now(),
  constraint daily_advice_valid_parts check(cardinality(parts) between 1 and 15)
);
alter table v21_private.taphoa_daily_advice_batches enable row level security;
revoke all on v21_private.taphoa_daily_advice_batches from public,anon,authenticated;
grant select,insert on v21_private.taphoa_daily_advice_batches to service_role;

create or replace function v21_private.taphoa_daily_advice_send_ordered(p_at timestamptz default now())
returns jsonb
language plpgsql security definer
set search_path = 'public','v21_private','pg_temp'
as $body$
declare
  v_local timestamp := p_at at time zone 'Asia/Ho_Chi_Minh';
  v_date date := (p_at at time zone 'Asia/Ho_Chi_Minh')::date;
  v_campaign text := 'advisory:general:group:' || to_char(p_at at time zone 'Asia/Ho_Chi_Minh','YYYYMMDD');
  v_sender uuid;
  v_receiver uuid;
  v_zalo text;
  v_conversation uuid;
  v_batch v21_private.taphoa_daily_advice_batches%rowtype;
  v_full text;
  v_lines text[];
  v_parts text[] := array[]::text[];
  v_current text;
  v_index integer;
  v_count integer;
  v_message uuid;
  v_client text;
  v_state text;
  v_zalo_message text;
  v_prefix text;
begin
  if v_local::time < time '09:00' or v_local::time >= time '09:30' then
    return jsonb_build_object('ok',true,'status','outside_window');
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('taphoa-advice-sequenced:'||v_date::text,0)) then
    return jsonb_build_object('ok',true,'status','busy');
  end if;

  -- Verify the fixed authorized recipient anew on every run.
  select l.linked_by_account_id,l.chat_account_id,z.zalo_id
    into v_sender,v_receiver,v_zalo
  from public.zalo_contacts z
  join public.zalo_user_links l on l.zalo_id=z.zalo_id
  join public.v21_accounts a on a.id=l.linked_by_account_id
  join public.v21_accounts t on t.id=l.chat_account_id
  where z.display_name='Báo Giá - 0911479555'
    and z.thread_type='group'
    and a.role='admin' and a.deleted_at is null and a.locked_at is null
    and t.role='user' and t.deleted_at is null and t.locked_at is null
  order by l.linked_at desc limit 1;
  if v_sender is null then
    return jsonb_build_object('ok',false,'status','destination_not_verified');
  end if;

  select c.id into v_conversation
  from public.v21_conversations c
  where (c.member_a=v_sender and c.member_b=v_receiver)
     or (c.member_b=v_sender and c.member_a=v_receiver)
  order by c.created_at desc limit 1;
  if v_conversation is null then
    return jsonb_build_object('ok',false,'status','conversation_missing');
  end if;

  -- Avoid duplicates if an older all-in-one sender ran on the same day.
  if exists(select 1 from public.v21_messages m
            where m.sender_account_id=v_sender and m.client_id=v_campaign) then
    return jsonb_build_object('ok',true,'status','older_campaign_exists');
  end if;

  select * into v_batch
  from v21_private.taphoa_daily_advice_batches
  where business_date=v_date for update;

  if not found then
    v_full := v21_private.taphoa_daily_consultation_text(p_at);
    v_lines := string_to_array(v_full,E'\n');
    if cardinality(v_lines)=0 then
      return jsonb_build_object('ok',false,'status','empty_catalogue');
    end if;
    v_current := v_lines[1];
    for v_index in 2..cardinality(v_lines) loop
      if char_length(v_current)+char_length(v_lines[v_index])+1 > 1350 then
        v_parts := array_append(v_parts,v_current);
        v_current := v_lines[v_index];
      else
        v_current := v_current||E'\n'||v_lines[v_index];
      end if;
    end loop;
    v_parts := array_append(v_parts,v_current);
    v_count := cardinality(v_parts);
    if v_count not between 1 and 15
      or array_to_string(v_parts,E'\n') <> v_full then
      raise exception 'daily_consultation_split_invalid';
    end if;
    insert into v21_private.taphoa_daily_advice_batches
      (business_date,sender_id,receiver_id,zalo_id,body,parts)
    values(v_date,v_sender,v_receiver,v_zalo,v_full,v_parts)
    returning * into v_batch;
  else
    if v_batch.sender_id<>v_sender or v_batch.receiver_id<>v_receiver
      or v_batch.zalo_id<>v_zalo then
      return jsonb_build_object('ok',false,'status','linked_destination_changed');
    end if;
  end if;
  v_count:=cardinality(v_batch.parts);

  for v_index in 1..v_count loop
    v_client := v_campaign||':part:'||lpad(v_index::text,2,'0');
    v_message := null;
    select m.id into v_message
    from public.v21_messages m
    where m.sender_account_id=v_sender and m.client_id=v_client
      and m.conversation_id=v_conversation and m.deleted_at is null
    limit 1;

    if v_message is not null then
      select z.state,z.zalo_message_id
        into v_state,v_zalo_message
      from public.zalo_message_links z
      where z.chat_message_id=v_message and z.direction='outbound'
        and z.zalo_id=v_zalo
      order by z.created_at desc limit 1;
      if v_state='sent' and nullif(v_zalo_message,'') is not null then
        continue;
      end if;
      return jsonb_build_object('ok',false,'status',coalesce(v_state,'outbox_missing'),
        'part',v_index,'parts',v_count,'message_id',v_message);
    end if;

    v_prefix := '[TƯ VẤN HÀNG TỔNG HỢP - PHẦN '||v_index||'/'||v_count||']';
    if char_length(v_prefix)+1+char_length(v_batch.parts[v_index])>1500 then
      raise exception 'daily_advice_part_too_long:%',v_index;
    end if;
    insert into public.v21_messages
      (conversation_id,sender_account_id,client_id,body)
    values(v_conversation,v_sender,v_client,
      v_prefix||E'\n'||v_batch.parts[v_index])
    on conflict on constraint v21_messages_sender_account_id_client_id_key
    do nothing returning id into v_message;
    if v_message is null then
      return jsonb_build_object('ok',false,'status','concurrent_message_conflict',
        'part',v_index);
    end if;
    if not exists(
      select 1 from public.zalo_message_links z
      where z.chat_message_id=v_message and z.direction='outbound'
        and z.zalo_id=v_zalo
    ) then
      raise exception 'daily_advice_outbox_missing:%',v_index;
    end if;
    return jsonb_build_object('ok',true,'status','queued',
      'recipient','Báo Giá - 0911479555',
      'part',v_index,'parts',v_count,'message_id',v_message);
  end loop;
  return jsonb_build_object('ok',true,'status','sent',
    'recipient','Báo Giá - 0911479555',
    'parts',v_count,'business_date',v_date::text);
end;
$body$;

revoke all on function v21_private.taphoa_daily_advice_send_ordered(timestamptz)
  from public,anon,authenticated;
grant execute on function v21_private.taphoa_daily_advice_send_ordered(timestamptz)
  to service_role;
