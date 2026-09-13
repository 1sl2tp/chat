begin;

create table if not exists public.chat_order_drafts (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.v21_accounts(id),
  conversation_id uuid null references public.v21_conversations(id) on delete set null,
  customer_name text not null check (length(btrim(customer_name)) > 0),
  created_by_account_id uuid not null references public.v21_accounts(id),
  status text not null default 'draft' check (status = 'draft'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_order_draft_lines (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.chat_order_drafts(id) on delete cascade,
  line_no integer not null check (line_no > 0),
  quantity numeric not null check (quantity > 0),
  raw_name text not null check (length(btrim(raw_name)) > 0),
  product_id text null references public.products(id) on delete set null,
  product_name text null,
  unit_price numeric null check (unit_price is null or unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, line_no)
);

create index if not exists chat_order_drafts_creator_updated_idx
  on public.chat_order_drafts(created_by_account_id, updated_at desc);

create index if not exists chat_order_draft_lines_draft_line_idx
  on public.chat_order_draft_lines(draft_id, line_no);

alter table public.chat_order_drafts enable row level security;
alter table public.chat_order_draft_lines enable row level security;
revoke all on public.chat_order_drafts from public, anon, authenticated;
revoke all on public.chat_order_draft_lines from public, anon, authenticated;

create or replace function public.chat_order_draft_create(
  p_contact_id uuid,
  p_conversation_id uuid,
  p_customer_name text,
  p_created_by_account_id uuid,
  p_lines jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_draft_id uuid;
  v_line jsonb;
  v_line_no integer := 0;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'draft_lines_required';
  end if;

  insert into public.chat_order_drafts(contact_id, conversation_id, customer_name, created_by_account_id)
  values(p_contact_id, p_conversation_id, btrim(p_customer_name), p_created_by_account_id)
  returning id into v_draft_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no := v_line_no + 1;
    insert into public.chat_order_draft_lines(draft_id, line_no, quantity, raw_name)
    values(
      v_draft_id,
      v_line_no,
      (v_line->>'quantity')::numeric,
      btrim(v_line->>'name')
    );
  end loop;

  return v_draft_id;
end;
$$;

revoke all on function public.chat_order_draft_create(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.chat_order_draft_create(uuid, uuid, text, uuid, jsonb) to service_role;

commit;
