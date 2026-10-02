-- Extend low-risk retention after the business Supabase cutover.
-- This never deletes canonical messages, orders, order items, debt, accounts, or products.

create or replace function business_private.retention_cleanup()
returns void
language plpgsql
set search_path to 'public','business_private'
as $$
begin
  delete from public.v21_sync_events
   where created_at < now()-interval '7 days';

  delete from public.chat_customer_summary_runs
   where status in ('done','failed')
     and finished_at is not null
     and finished_at < now()-interval '30 days';

  delete from public.chat_ai_message_inbox
   where (status in ('processed','ignored') and created_at < now()-interval '30 days')
      or (status='failed' and created_at < now()-interval '90 days');

  delete from public.getlink_ai_message_inbox
   where (status in ('processed','ignored') and created_at < now()-interval '30 days')
      or (status='failed' and created_at < now()-interval '90 days');

  delete from public.getlink_ai_reply_outbox
   where status='sent'
     and created_at < now()-interval '30 days';

  delete from public.getlink_ai_turn_audit
   where created_at < now()-interval '90 days';

  delete from public.getlink_update_queue
   where (status='complete' and created_at < now()-interval '30 days')
      or (status='error' and created_at < now()-interval '90 days');

  delete from public.getlink_update_runs
   where status in ('complete','complete_with_errors','error','failed')
     and created_at < now()-interval '90 days';

  delete from public.v21_push_outbox
   where state in ('sent','dead')
     and created_at < now()-interval '30 days';

  delete from public.v21_call_invite_push_outbox
   where state in ('sent','dead')
     and created_at < now()-interval '30 days';

  delete from public.chat_notification_outbox
   where processed_at is not null
     and created_at < now()-interval '30 days';

  delete from public.chat_call_invites
   where expires_at < now()-interval '30 days';

  delete from public.taphoa_product_outbox
   where status in ('pushed','superseded')
     and created_at < now()-interval '90 days';

  delete from public.livekit_audio_proof_logs
   where created_at < now()-interval '30 days';

  delete from public.login_rate_limits
   where updated_at < now()-interval '7 days';

  delete from public.operation_audit
   where created_at < now()-interval '365 days';

  delete from public.business_audit_log
   where created_at < now()-interval '365 days';

  delete from public.taphoa_command_log
   where created_at < now()-interval '365 days';

  delete from public.zalo_message_links
   where state in ('sent','received')
     and created_at < now()-interval '365 days';

  delete from public.taphoa_sheet_watch_channels
   where expires_at < now()-interval '7 days';

  delete from public.getlink_sheet_watch_channels
   where expires_at < now()-interval '7 days';

  delete from cron.job_run_details
   where end_time is not null
     and end_time < now()-interval '14 days';
end;
$$;
