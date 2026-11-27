\set ON_ERROR_STOP on
-- Isolated database; minimal schema for the existing writer. No production connections.
create schema extensions;
create extension unaccent with schema extensions;
create schema v21_private;
create table public.chat_auto_collect_settings(singleton boolean primary key,enabled boolean,ready boolean);
create table public.chat_bank_bill_receipts(id uuid primary key,media_asset_id uuid unique,message_id uuid,customer_account_id uuid,sent_at timestamptz,image_sha256 text,raw_read jsonb,sending_bank text,receiving_bank text,receiving_name text,receiving_account text,transfer_reference text,transfer_at_vn timestamp,amount_vnd bigint,status text,reason text,ledger_id bigint,model_name text,scanned_at timestamptz,balance_before_thousands numeric,balance_after_thousands numeric);
create table public.taphoa_agribank_notifications(id bigint primary key,device_id uuid,package_name text,body text,fingerprint text,amount_vnd bigint,status text,transfer_at timestamptz,is_own_transfer boolean,bank_credit_account text,received_at timestamptz);
create table public.taphoa_sms_ingest_devices(id uuid primary key,active boolean);
create table public.chat_bank_app_collection_links(receipt_id uuid primary key,notification_id bigint unique,ledger_id bigint unique);
create table public.chat_bank_manual_collections(notification_id bigint primary key,ledger_id bigint unique);
create table public.chat_bank_bill_manual_collections(receipt_id uuid primary key,ledger_id bigint unique);
create table public.taphoa_command_log(command_id uuid primary key,operation text,result jsonb);
create table public.taphoa_debt_ledger(id bigint generated always as identity primary key,customer_account_id uuid,entry_type text,amount_vnd numeric,note text,created_by_account_id uuid,created_at timestamptz default now());
create table public.v21_accounts(id uuid primary key,role text,contact_group text,deleted_at timestamptz,locked_at timestamptz);
create table public.v21_conversations(id uuid primary key,member_a uuid,member_b uuid);
create table public.v21_messages(id uuid primary key,sender_account_id uuid,conversation_id uuid,created_at timestamptz,deleted_at timestamptz);
create table public.v21_media_assets(id uuid primary key,message_id uuid,owner_account_id uuid,kind text,deleted_at timestamptz);
create function public.taphoa_chat_customer_balance_value(uuid) returns numeric language sql stable as $$select coalesce(sum(amount_vnd),0) from public.taphoa_debt_ledger where customer_account_id=$1$$;
create function public.taphoa_bump_revision(text) returns integer language sql as $$select 1$$;
create function public.taphoa_chat_money(numeric) returns text language sql as $$select $1::text$$;
create function public.taphoa_chat_balance_label(numeric,boolean) returns text language sql as $$select $1::text$$;
create function public.taphoa_customer_mini_link(uuid,text,text,text,text) returns text language sql as $$select ''::text$$;
create role fixture_client;
create role service_role;
\ir ../../docs/sql/bank-noclock-current-01-candidate.sql
revoke execute on function public.chat_bank_app_collect(uuid,bigint) from public;
grant execute on function public.chat_bank_app_collect(uuid,bigint) to service_role;
-- All IDs are fixture-only.
create function fixture_reset() returns void language plpgsql as $$
declare t timestamptz:=date_trunc('minute',now())-interval '2 minutes'; d date:=(t at time zone 'Asia/Ho_Chi_Minh')::date;
begin
 if d<>(now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Fixture requires at least two minutes into VN day'; end if;
 truncate chat_auto_collect_settings,chat_bank_bill_receipts,taphoa_agribank_notifications,taphoa_sms_ingest_devices,chat_bank_app_collection_links,chat_bank_manual_collections,chat_bank_bill_manual_collections,taphoa_command_log,taphoa_debt_ledger,v21_accounts,v21_conversations,v21_messages,v21_media_assets restart identity;
 insert into chat_auto_collect_settings values(true,true,true);
 insert into v21_accounts values('00000000-0000-0000-0000-000000000001','user','customer',null,null),('00000000-0000-0000-0000-000000000002','admin',null,null,null);
 insert into v21_conversations values('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
 insert into v21_messages values('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',t+interval '28 seconds',null);
 insert into v21_media_assets values('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','image',null);
 insert into taphoa_sms_ingest_devices values('00000000-0000-0000-0000-000000000006',true);
 insert into taphoa_agribank_notifications values(1,'00000000-0000-0000-0000-000000000006','com.vnpay.Agribank3g','Agribank: '||to_char(t at time zone 'Asia/Ho_Chi_Minh','HH24:MI DD/MM/YYYY')||' Tài khoản 2901181999999: +750,000VND. Nội dung giao dịch: TRAN VAN TEST chuyen tien. Số dư cuối: 100VND','fixture-fingerprint',750000,'credit_candidate',t,false,'2901181999999',now());
 insert into chat_bank_bill_receipts(id,media_asset_id,message_id,customer_account_id,sent_at,image_sha256,raw_read,sending_bank,receiving_bank,receiving_name,receiving_account,transfer_reference,transfer_at_vn,amount_vnd,status,reason,ledger_id,model_name,scanned_at)
 values('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001',t+interval '28 seconds','fixture-image',
 jsonb_build_object('rule_version','bank_bill_amount_v5_20261110','image_type','successful_transfer_receipt','transfer_success_visible',true,'amount_clear',true,'transaction_selection','single_detail','transaction_nature','transfer','transfer_time_printed_vn',null,'transaction_datetime_vn',null,'recipient_account_last5','99999','transfer_date_vn',to_char(d,'YYYY-MM-DD'),'transfer_date_printed_vn',to_char(d,'DD/MM/YYYY'),'transfer_content','TRAN VAN TEST chuyen tien','sender_name',null,'receiving_bank',null,'match_preview',jsonb_build_object('status','review')),
 'VPBank',null,'BUI XUAN TUNG','2901181999999','TESTREF12345678',null,750000,'review','bill_printed_time_missing',null,'fixture',now());
end $$;
create function fixture_call() returns jsonb language sql as $$select public.chat_bank_app_collect('00000000-0000-0000-0000-000000000005',1)$$;
create function fixture_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end$$;
