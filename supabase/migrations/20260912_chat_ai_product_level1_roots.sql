begin;

-- Structured search now treats the configured key columns only as ordered
-- levels 1..9. A product may therefore be represented by a single exact
-- level-1/root alias when it has no deeper branch.
insert into public.chat_ai_product_keys(
  product_code,product_name,type,c1,c2,size,label2,form,color,volume,variant,active,updated_at
) values (
  'tau67',
  'Huong duong mv',
  'huong duong my vi, huong duong mv',
  null,null,null,null,null,null,null,null,
  true,
  now()
)
on conflict(product_name) do update set
  product_code=excluded.product_code,
  type=excluded.type,
  c1=excluded.c1,
  c2=excluded.c2,
  size=excluded.size,
  label2=excluded.label2,
  form=excluded.form,
  color=excluded.color,
  volume=excluded.volume,
  variant=excluded.variant,
  active=true,
  updated_at=now();

commit;
