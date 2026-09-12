begin;

alter table public.chat_ai_product_keys
  add column if not exists source text,
  add column if not exists level1 text,
  add column if not exists level2 text,
  add column if not exists level3 text,
  add column if not exists level4 text,
  add column if not exists level5 text,
  add column if not exists level6 text,
  add column if not exists level7 text,
  add column if not exists level8 text,
  add column if not exists level9 text;

with compacted as (
  select
    product_name,
    type as old_source,
    array_remove(array[
      nullif(btrim(c1),''),
      nullif(btrim(c2),''),
      nullif(btrim(size),''),
      nullif(btrim(label2),''),
      nullif(btrim(form),''),
      nullif(btrim(color),''),
      nullif(btrim(volume),''),
      nullif(btrim(variant),'')
    ]::text[],null) as path
  from public.chat_ai_product_keys
)
update public.chat_ai_product_keys k
set
  source=coalesce(k.source,case when cardinality(c.path)>0 then c.old_source else null end),
  level1=coalesce(k.level1,case when cardinality(c.path)>0 then c.path[1] else c.old_source end),
  level2=coalesce(k.level2,c.path[2]),
  level3=coalesce(k.level3,c.path[3]),
  level4=coalesce(k.level4,c.path[4]),
  level5=coalesce(k.level5,c.path[5]),
  level6=coalesce(k.level6,c.path[6]),
  level7=coalesce(k.level7,c.path[7]),
  level8=coalesce(k.level8,c.path[8]),
  level9=coalesce(k.level9,c.path[9]),
  updated_at=now()
from compacted c
where c.product_name=k.product_name;

commit;
