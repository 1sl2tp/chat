-- Candidate integration only. Requires push-attempt-candidate.sql.
-- No old processing row is replayed. New claim and attempt record commit atomically.
begin;
create or replace function v21_private.push_claim_fenced(p_family text,p_limit integer default 10)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare row_data jsonb; result jsonb:='[]'::jsonb; output jsonb:='[]'::jsonb; token uuid; qid uuid; attempt integer;
begin
 if p_family not in ('chat','bank_admin') or p_family is null then raise exception 'invalid_push_family'; end if;
 if p_family='chat' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from public.v21_admin_push_claim(least(greatest(coalesce(p_limit,10),1),10)) q;
 else
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from public.chat_bank_admin_push_claim(least(greatest(coalesce(p_limit,10),1),10)) q;
 end if;
 for row_data in select value from jsonb_array_elements(result) loop

  qid:=coalesce(row_data->>'outbox_id',row_data->>'id')::uuid;
  attempt:=(row_data->>'attempt_count')::integer;
  token:=gen_random_uuid();
  insert into v21_private.push_delivery_attempt(family,outbox_id,attempt_no,token,phase,lease_until)
  values(p_family,qid,attempt,token,'claimed',clock_timestamp()+interval '3 minutes');
  output:=output||jsonb_build_array(row_data||jsonb_build_object('attempt_token',token,'family',p_family));
 end loop;
 return output;
end $$;
-- Atomic fenced completion: unknown never requeues, even after lease expiry.
-- "not_sent" is only safe when the provider was demonstrably never called/accepted.
create or replace function v21_private.push_finish_fenced(p_family text,p_id uuid,p_attempt integer,p_token uuid,p_outcome text,p_terminal boolean default false)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare locked_attempt integer; changed integer; next_state text; current_phase text;
begin
 if p_family not in ('chat','bank_admin') or p_family is null or p_outcome not in ('confirmed','not_sent','unknown') or p_outcome is null then return false; end if;
 if p_family='chat' then
  select attempt_count into locked_attempt from public.v21_push_outbox where id=p_id and state='processing' for update;
 else
  select attempt_count into locked_attempt from public.chat_bank_admin_push_outbox where id=p_id and state='processing' for update;
 end if;
 if locked_attempt is distinct from p_attempt then return false; end if;
 select a.phase into current_phase from v21_private.push_delivery_attempt a
 where a.family=p_family and a.outbox_id=p_id and a.attempt_no=p_attempt and a.token=p_token
 and a.lease_until>clock_timestamp() for update;
 if current_phase is null or (current_phase<>'dispatching' and not(current_phase='claimed' and p_outcome='not_sent')) then return false; end if;
 if p_outcome='confirmed' then next_state:='sent';
 elsif p_outcome='unknown' then next_state:='processing';
 elsif p_terminal is true or p_attempt>=3 then next_state:='dead';
 else next_state:='retry'; end if;
 update v21_private.push_delivery_attempt a set phase=p_outcome,updated_at=clock_timestamp()
 where a.family=p_family and a.outbox_id=p_id and a.attempt_no=p_attempt and a.token=p_token;
 if p_family='chat' then
  update public.v21_push_outbox set state=next_state,updated_at=clock_timestamp(),
   available_at=clock_timestamp()+case when next_state='retry' then interval '30 seconds' else interval '0 seconds' end,
   last_error=case when p_outcome='confirmed' then null else 'fenced_'||p_outcome end
  where id=p_id and state='processing' and attempt_count=p_attempt;
 else
  update public.chat_bank_admin_push_outbox set state=next_state,updated_at=clock_timestamp(),
   available_at=clock_timestamp()+case when next_state='retry' then interval '30 seconds' else interval '0 seconds' end,
   last_error=case when p_outcome='confirmed' then null else 'fenced_'||p_outcome end
  where id=p_id and state='processing' and attempt_count=p_attempt;
 end if;
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'fenced_ack_conflict'; end if;
 return true;
end $$;
revoke all on function v21_private.push_claim_fenced(text,integer) from public,anon,authenticated;
revoke all on function v21_private.push_finish_fenced(text,uuid,integer,uuid,text,boolean) from public,anon,authenticated;
commit;
