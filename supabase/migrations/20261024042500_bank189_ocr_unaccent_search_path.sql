-- Resolve extensions.unaccent for Vietnamese bank transfer memo verification.
alter function public.chat_bank_reconcile_ocr_year(uuid,bigint) set search_path to public,v21_private,extensions,pg_temp;
