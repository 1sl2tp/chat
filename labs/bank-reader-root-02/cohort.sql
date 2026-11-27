-- Read-only inventory: only aggregate information leaves database.
with h as (
 select image_sha256, count(*) records,
 bool_or(status='received') received,
 bool_or(status='non_bill') non_bill,
 bool_or(raw_read->>'image_layout' is null) layout_missing
 from public.chat_bank_bill_receipts
 where image_sha256 ~ '^[a-f0-9]{64}$'
 group by image_sha256
)
select case when get_byte(decode(image_sha256,'hex'),0)<51 then 'holdout' else 'development' end dataset,
 count(*) unique_images,sum(records) records,
 count(*) filter(where received) received,
 count(*) filter(where non_bill) non_bill,
 count(*) filter(where received and non_bill) conflict
from h group by 1 order by 1;
