-- Internal read-only catalogue, do not export private images/values to GitHub.
-- Bank evidence and OCR evidence are distinct, not ground truth for all fields.
select r.id as receipt_id, r.image_sha256, r.ledger_id,
 coalesce(r.raw_read->>'sending_bank',r.sending_bank,'unknown') as bank_label,
 r.raw_read->>'image_layout' as layout, a.mime_type,a.width_px,a.height_px,
 (n.amount_vnd=r.amount_vnd) as amount_bank_verified,
 (n.bank_credit_account is not null) as account_bank_evidence,
 (b.state='verified' and b.result->>'exact'='true') as image_account_benchmark,
 (r.raw_read->>'account_visual_correction' is not null) as manually_corrected_account,
 (r.raw_read->>'transfer_time_printed_vn' is not null) as ocr_clock_present
from public.chat_bank_bill_receipts r
join public.chat_bank_app_collection_links l on l.receipt_id=r.id and l.ledger_id=r.ledger_id
join public.taphoa_agribank_notifications n on n.id=l.notification_id
join public.v21_media_assets a on a.id=r.media_asset_id and a.message_id=r.message_id and a.owner_account_id=r.customer_account_id and a.deleted_at is null
left join v0_private.bill_account_crop_benchmark b on b.receipt_id=r.id
where r.status='received' and r.sent_at >= '2026-11-27 00:00+07' and r.sent_at < '2026-11-28 00:00+07'
order by bank_label,r.id;
