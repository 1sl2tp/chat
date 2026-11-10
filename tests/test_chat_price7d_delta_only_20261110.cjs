'use strict';
// PRICE-274: daily group quotes only for new products or changed sale price.
// Static regression: tests MUST NEVER send customer/group messages.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=fs.readFileSync('supabase/migrations/20261110153141_price274_baseline_for_changed_group_quotes.sql','utf8');
const sender=fs.readFileSync('supabase/migrations/20261110153235_price274_gate_daily_group_send_on_real_catalog_changes.sql','utf8');
const original=fs.readFileSync('supabase/migrations/20261110000000_chat_price7d_group_advisory.sql','utf8');
assert.match(base,/CREATE TABLE IF NOT EXISTS v21_private\.taphoa_price7d_delivery_state/);
assert.match(base,/CREATE TABLE IF NOT EXISTS v21_private\.taphoa_price7d_skipped_days/);
assert.match(base,/v21_private\.taphoa_price7d_catalogue_snapshot/);
assert.match(base,/v21_private\.taphoa_price7d_delta_text/);
assert.match(base,/v21_private\.taphoa_price7d_batches[\s\S]*catalogue_snapshot jsonb/);
assert.match(base,/p\.is_active=true AND p\.deleted_at IS NULL/);
assert.match(base,/p\.input_price_vnd>0 AND p\.sale_price_vnd>0/);
assert.match(base,/p\.source_key<>'thuoc-la'/);
assert.match(base,/NOT\(p_previous \? c\.key\)/); // new product
assert.match(base,/IS DISTINCT FROM c\.value->>'price'/); // real price change
assert.match(base,/IF nullif\(v_lines,''\) IS NULL THEN RETURN NULL/); // no message
assert.match(base,/sale_before::text\|\|' -> '\|\|sale_now::text/);
assert.match(base,/\[MỚI\]/);
assert.match(base,/abs\(sale_now-sale_before\)\/sale_before<=0\.30/);
assert.doesNotMatch(base,/FROM public\.taphoa_orders/i,
 'A delivered or pending order with unchanged catalogue must NOT send');
assert.match(base,/z\.state='sent'/);
assert.match(base,/price7d_unsent_old_batch/);
const noChange=sender.indexOf("IF v_count=0 THEN");
const insertBatch=sender.indexOf("INSERT INTO v21_private.taphoa_price7d_batches");
const insertMessage=sender.indexOf("INSERT INTO public.v21_messages");
const afterAllParts=sender.indexOf("IF v_batch.catalogue_snapshot IS NOT NULL");
assert(noChange>0&&insertBatch>noChange&&insertMessage>insertBatch&&afterAllParts>insertMessage,
 'No-change gate must run BEFORE creating a batch or sending, baseline AFTER all ACKs');
assert.match(sender,/FROM v21_private\.taphoa_price7d_skipped_days WHERE business_date=v_day/);
assert.match(sender,/status','no_change'/);
assert.match(sender,/v_full:=v21_private\.taphoa_price7d_delta_text/);
assert.match(sender,/prior_delivery_pending/);
assert.match(sender,/v_base\.catalogue_snapshot->c\.key->>'price'/);
assert.match(sender,/WHERE business_date=v_day FOR UPDATE/);
assert.match(sender,/v_state='sent' AND nullif\(v_zalo_message,''\) IS NOT NULL/);
assert.match(sender,/v_client:=v_campaign\|\|':part:'/);
assert.match(sender,/price7d_outbox_missing/);
assert.match(sender,/UPDATE v21_private\.taphoa_price7d_delivery_state/);
assert.match(sender,/last_success_at<v_batch\.created_at/);
assert.match(sender,/CẬP NHẬT BÁO GIÁ/);
assert.match(original,/'0-44 23 \* \* \*'/,'existing 06:00 ICT cadence unchanged');
assert.doesNotMatch(sender,/cron\.schedule|cron\.unschedule|cron\.alter_job/,
 'Do not add or edit cron jobs as part of message gate');
assert.doesNotMatch(sender,/taphoa_price7d_text\(p_at\)/,
 'Do not send old 7d full catalogue when unchanged');
console.log('PRICE-274: only new products / changed sale price trigger; no-change and sequential ACK safety PASS');
