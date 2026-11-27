-- Disposable database only.
create role anon;
create role authenticated;
create schema auth;
create schema v21_private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('fixture.uid',true),'')::uuid$$;
create function public.taphoa_access_context() returns jsonb language sql stable as $$select jsonb_build_object('allowed',true,'taphoa_role','admin','account_id',current_setting('fixture.actor',true))$$;
create function v21_private.chat_outbound_allowed(uuid,text) returns boolean language sql stable as $$select current_setting('fixture.optin',true)='yes'$$;
create table public.v21_accounts(id uuid primary key,auth_user_id uuid,role text,contact_group text,locked_at timestamptz,deleted_at timestamptz);
create table public.v21_conversations(id uuid primary key,member_a uuid,member_b uuid);
create table public.v21_messages(id uuid primary key,sender_account_id uuid,conversation_id uuid,client_id text,created_at timestamptz,deleted_at timestamptz);
create table public.taphoa_command_log(command_id uuid primary key,operation text,result jsonb,created_at timestamptz);
create table public.taphoa_debt_ledger(id bigint primary key,customer_account_id uuid,created_by_account_id uuid,entry_type text,amount_vnd numeric,created_at timestamptz);
create table public.v21_media_assets(id uuid primary key,message_id uuid,deleted_at timestamptz);
grant usage on schema v21_private to authenticated;
\ir snapshot-proof-candidate.sql
do $$
declare
 actor constant uuid:='00000000-0000-4000-8000-000000000001';
 uid constant uuid:='00000000-0000-4000-8000-000000000002';
 customer constant uuid:='00000000-0000-4000-8000-000000000003';
 room constant uuid:='00000000-0000-4000-8000-000000000004';
 cid constant uuid:='00000000-0000-4000-8000-000000000005';
 mid constant uuid:='00000000-0000-4000-8000-000000000006';
 ts timestamptz:=now()-interval '3 days';
 payload jsonb; result jsonb;
begin
 perform set_config('fixture.uid',uid::text,true);
 perform set_config('fixture.actor',actor::text,true);
 perform set_config('fixture.optin','yes',true);
 insert into public.v21_accounts values(actor,uid,'admin',null,null,null),(customer,null,'user','customer',null,null);
 insert into public.v21_conversations values(room,actor,customer);
 insert into public.v21_messages values(mid,actor,room,'taphoa:'||cid||':collection',ts,null);
 payload:=jsonb_build_object('ok',true,'notice_sent',true,'customer_id',customer,'receipt_kind','collection','source','manual_cash','ledger_id',1,'amount_vnd',500,'source_amount_vnd',500000,'movement',-500,'balance_before_vnd',900,'balance_after_vnd',400,'receipt_at',ts);
 insert into public.taphoa_command_log values(cid,'debt_transaction',payload,ts);
 insert into public.taphoa_debt_ledger values(1,customer,actor,'collection',-500,ts);
 result:=public.finance_notice_snapshot_proof(mid);
 if result->>'state'<>'verified_snapshot' or result->>'image_policy'<>'explicit_review_required' then raise exception 'cash proof %',result; end if;
 update public.taphoa_command_log set result=payload||jsonb_build_object('source_amount_vnd',500) where command_id=cid;
 if public.finance_notice_snapshot_proof(mid)->>'state'<>'review' then raise exception 'wrong units'; end if;
 update public.taphoa_command_log set result=payload-'source'-'source_amount_vnd'-'ledger_id' where command_id=cid;
 if public.finance_notice_snapshot_proof(mid)->>'state'<>'verified_snapshot' then raise exception 'legacy exact match'; end if;
 insert into public.taphoa_debt_ledger values(2,customer,actor,'collection',-500,ts);
 if public.finance_notice_snapshot_proof(mid)->>'state'<>'review' then raise exception 'ambiguous legacy ledger'; end if;
 perform set_config('fixture.optin','no',true);
 if public.finance_notice_snapshot_proof(mid)->>'state'<>'blocked' then raise exception 'consent'; end if;
 if has_function_privilege('anon','public.finance_notice_snapshot_proof(uuid)','execute') then raise exception 'anon grant'; end if;
 if (select count(*) from public.taphoa_debt_ledger)<>2 or (select count(*) from public.v21_messages)<>1 then raise exception 'proof mutation'; end if;
end $$;
