begin;

alter table public.chat_ai_product_keys
  alter column product_code set not null;

alter table public.chat_ai_product_keys
  drop constraint chat_ai_product_keys_pkey;

alter table public.chat_ai_product_keys
  add constraint chat_ai_product_keys_pkey primary key (product_code);

commit;
