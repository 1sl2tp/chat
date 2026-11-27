\set ON_ERROR_STOP on
select fixture_reset();
select fixture_assert((fixture_call()->>'status')='received','matching no-clock receipt posts');
select fixture_assert((select count(*)=1 and sum(amount_vnd)=-750 from taphoa_debt_ledger),'exact one debt entry');
select fixture_assert((fixture_call()->>'replayed')='true','retry is replay');
select fixture_assert((select count(*)=1 from taphoa_debt_ledger),'replay no extra ledger');
select fixture_assert((select raw_read->>'transfer_time_printed_vn' is null and raw_read->>'sender_name' is null and raw_read->>'receiving_bank' is null and raw_read#>>'{manual_datetime_correction,reason}'='bank_noclock_current_01' and status='received' from chat_bank_bill_receipts),'OCR missing fields preserved and bank evidence stored separately');
select fixture_assert(not has_function_privilege('fixture_client','public.chat_bank_app_collect(uuid,bigint)','EXECUTE'),'client cannot execute writer');
select fixture_assert(has_function_privilege('service_role','public.chat_bank_app_collect(uuid,bigint)','EXECUTE'),'service_role can execute writer');
-- Negative cases call actual same writer, not a boolean-only model.
do $$
declare c text; outcome jsonb; original jsonb; baseline bigint;
begin
 foreach c in array array['memo','account','name','bank','time','date','early','late','own','device','credit','fingerprint','bill','image','manual_bank','manual_bill','manual_ledger','command','unresolved','owner','disabled','late_guard'] loop
  perform fixture_reset();
  case c
    when 'memo' then update chat_bank_bill_receipts set raw_read=raw_read||'{"transfer_content":"OTHER TRANSFER CONTENT 123456"}';
    when 'account' then update chat_bank_bill_receipts set receiving_account='2901181888888';
    when 'name' then update chat_bank_bill_receipts set receiving_name='OTHER NAME';
    when 'bank' then update chat_bank_bill_receipts set receiving_bank='Other';
    when 'time' then update chat_bank_bill_receipts set raw_read=raw_read||'{"transfer_time_printed_vn":"11:00"}';
    when 'date' then update chat_bank_bill_receipts set raw_read=raw_read||'{"transfer_date_vn":"2000-01-01"}';
    when 'early' then update chat_bank_bill_receipts set sent_at=(select transfer_at-interval '1 second' from taphoa_agribank_notifications);update v21_messages set created_at=(select sent_at from chat_bank_bill_receipts);
    when 'late' then update chat_bank_bill_receipts set sent_at=(select transfer_at+interval '121 seconds' from taphoa_agribank_notifications);update v21_messages set created_at=(select sent_at from chat_bank_bill_receipts);
    when 'own' then update taphoa_agribank_notifications set is_own_transfer=true;
    when 'device' then update taphoa_sms_ingest_devices set active=false;
    when 'credit' then insert into taphoa_agribank_notifications select 2,device_id,package_name,body,'other-fingerprint',amount_vnd,status,transfer_at,is_own_transfer,bank_credit_account,received_at from taphoa_agribank_notifications where id=1;
    when 'fingerprint' then insert into taphoa_agribank_notifications select 2,device_id,package_name,body,fingerprint,amount_vnd,'ignored',transfer_at,is_own_transfer,bank_credit_account,received_at from taphoa_agribank_notifications where id=1;
    when 'bill' then insert into chat_bank_bill_receipts(id,media_asset_id,customer_account_id,amount_vnd,sent_at,status) select '00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000010',amount_vnd,sent_at,'review' from chat_bank_bill_receipts;
    when 'image' then insert into chat_bank_bill_receipts(id,media_asset_id,image_sha256,status) select '00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000009',image_sha256,'review' from chat_bank_bill_receipts;
    when 'manual_bank' then insert into chat_bank_manual_collections values(1,99);
    when 'manual_bill' then insert into chat_bank_bill_manual_collections values('00000000-0000-0000-0000-000000000007',99);
    when 'manual_ledger' then insert into taphoa_debt_ledger(customer_account_id,entry_type,amount_vnd) values('00000000-0000-0000-0000-000000000001','collection',-750);
    when 'command' then insert into taphoa_command_log values('00000000-0000-0000-0000-000000000007','debt_transaction','{}');
    when 'unresolved' then insert into chat_bank_bill_receipts(id,media_asset_id,sent_at,status) select '00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000009',sent_at,'queued' from chat_bank_bill_receipts;
    when 'owner' then update v21_media_assets set owner_account_id='00000000-0000-0000-0000-000000000002';
    when 'disabled' then update chat_auto_collect_settings set enabled=false;
    when 'late_guard' then update v21_accounts set role='user' where role='admin';
  end case;
  select raw_read into original from chat_bank_bill_receipts where id='00000000-0000-0000-0000-000000000007';
  select count(*) into baseline from taphoa_debt_ledger;
  outcome:=fixture_call();
  perform fixture_assert(outcome->>'ok'='false',c||' blocks: '||outcome::text);
  perform fixture_assert((select count(*)=baseline from taphoa_debt_ledger),c||' no extra ledger');
  perform fixture_assert((select status='review' and transfer_at_vn is null and raw_read=original from chat_bank_bill_receipts where id='00000000-0000-0000-0000-000000000007'),c||' no partial mutation');
 end loop;
end $$;
-- Force a failure AFTER ledger insert to verify transaction rollback.
select fixture_reset();
alter table chat_bank_app_collection_links add constraint fixture_force_failure check (notification_id<>1);
do $$begin
 begin perform fixture_call(); raise exception 'Expected check failure';
 exception when check_violation then null; end;
 perform fixture_assert((select count(*)=0 from taphoa_debt_ledger),'forced late failure rolls back ledger');
 perform fixture_assert((select count(*)=0 from taphoa_command_log),'forced late failure rolls back command');
 perform fixture_assert((select status='review' and transfer_at_vn is null from chat_bank_bill_receipts),'forced late failure leaves original bill');
end$$;
alter table chat_bank_app_collection_links drop constraint fixture_force_failure;
select fixture_reset();
