-- NCC-001/003: Chat intake, assigned scan users and manual source; never write prices, orders, payments or send messages.
-- SOURCE ONLY: never apply an unreviewed migration to production.
alter table public.v21_accounts drop constraint if exists v21_accounts_contact_group_check;
alter table public.v21_accounts add constraint v21_accounts_contact_group_check
  check (contact_group in ('customer','cm','friend','other','ncc'));
comment on column public.v21_accounts.contact_group is
  'Admin-managed directory classification; ncc is supplier invoice intake only, not customer care';

create table if not exists public.chat_ncc_invoices (
 id uuid primary key default gen_random_uuid(),
 chat_account_id uuid references public.v21_accounts(id),
 supplier_label text,
 created_by uuid references public.v21_accounts(id),
 manual_fingerprint text,
 conversation_id uuid references public.v21_conversations(id),
 message_id uuid references public.v21_messages(id),
 media_asset_id uuid unique references public.v21_media_assets(id),
 origin text not null default 'chat' check (origin in ('chat','manual')),
 manual_storage_key text unique,
 manual_mime_type text check (manual_mime_type in ('image/jpeg','image/png','image/webp')),
 image_sha256 text,
 invoice_date date,
 invoice_number text,
 printed_total_vnd numeric check (printed_total_vnd is null or printed_total_vnd >= 0),
 ocr_lines jsonb not null default '[]'::jsonb check (jsonb_typeof(ocr_lines)='array'),
 status text not null default 'pending' check (status in ('pending','processing','not_invoice','needs_review','matched','duplicate','applied','failed')),
 note text,
 reviewed_by uuid references public.v21_accounts(id),
 reviewed_at timestamptz,
 applied_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check ((origin='chat' and conversation_id is not null and message_id is not null and media_asset_id is not null and manual_storage_key is null)
    or (origin='manual' and conversation_id is null and message_id is null and media_asset_id is null
      and created_by is not null and length(btrim(coalesce(supplier_label,''))) between 2 and 120
      and (manual_storage_key is null or manual_storage_key like 'ncc-manual/%' and manual_mime_type is not null))),
 check (invoice_number is null or length(btrim(invoice_number)) between 1 and 100),
 check (image_sha256 is null or image_sha256 ~ '^[0-9a-f]{64}
);
create unique index if not exists chat_ncc_invoice_number_unique
 on public.chat_ncc_invoices(coalesce(chat_account_id::text,'manual:'||lower(btrim(coalesce(supplier_label,'')))),invoice_date,lower(btrim(invoice_number)))
 where invoice_date is not null and invoice_number is not null and status <> 'duplicate';
create unique index if not exists chat_ncc_invoice_image_unique
 on public.chat_ncc_invoices(chat_account_id,image_sha256)
 where image_sha256 is not null and status <> 'duplicate';
create unique index if not exists chat_ncc_manual_fingerprint_unique
 on public.chat_ncc_invoices(manual_fingerprint) where origin='manual' and manual_fingerprint is not null;
create index if not exists chat_ncc_invoice_queue
 on public.chat_ncc_invoices(status,created_at) where status in ('pending','needs_review');
create table if not exists public.chat_ncc_invoice_lines (
 id bigint generated always as identity primary key,
 invoice_id uuid not null references public.chat_ncc_invoices(id) on delete cascade,
 row_no integer not null check (row_no > 0),
 printed_name text not null,
 quantity numeric not null check (quantity > 0),
 printed_unit text,
 unit_price_vnd numeric not null check (unit_price_vnd >= 0),
 line_total_vnd numeric not null check (line_total_vnd >= 0),
 product_code text references public.taphoa_products(product_code),
 match_method text not null default 'unmatched' check (match_method in ('unmatched','exact','alias','manual')),
 unit_factor numeric check (unit_factor is null or unit_factor > 0),
 normalized_cost_vnd numeric check (normalized_cost_vnd is null or normalized_cost_vnd >= 0),
 review_required boolean not null default true,
 unique(invoice_id,row_no)
);
create table if not exists public.chat_ncc_product_aliases (
 chat_account_id uuid not null references public.v21_accounts(id),
 supplier_name_key text not null,
 supplier_unit_key text not null default '',
 product_code text not null references public.taphoa_products(product_code),
 unit_factor numeric not null default 1 check (unit_factor > 0),
 created_at timestamptz not null default now(),
 primary key(chat_account_id,supplier_name_key,supplier_unit_key)
);
create table if not exists public.chat_ncc_scanner_assignments (
 account_id uuid primary key references public.v21_accounts(id) on delete cascade,
 enabled boolean not null default true,
 assigned_by uuid not null references public.v21_accounts(id),
 assigned_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
-- Service-only storage: no browser writes to private OCR text or product mappings.
alter table public.chat_ncc_invoices enable row level security;
alter table public.chat_ncc_invoice_lines enable row level security;
alter table public.chat_ncc_product_aliases enable row level security;
alter table public.chat_ncc_scanner_assignments enable row level security;
revoke all on public.chat_ncc_invoices,public.chat_ncc_invoice_lines,public.chat_ncc_product_aliases,public.chat_ncc_scanner_assignments from public,anon,authenticated;
grant select,insert,update,delete on public.chat_ncc_invoices,public.chat_ncc_invoice_lines,public.chat_ncc_product_aliases,public.chat_ncc_scanner_assignments to service_role;
grant usage,select on sequence public.chat_ncc_invoice_lines_id_seq to service_role;

create or replace function public.chat_ncc_queue_received_image()
 returns trigger language plpgsql security definer set search_path=public as $$
declare v_sender uuid; v_hash text;
begin
 if new.deleted_at is not null or new.message_id is null
    or new.kind not in ('image','photo') then return new; end if;
 select m.sender_account_id into v_sender from public.v21_messages m
  where m.id=new.message_id and m.conversation_id=new.conversation_id and m.deleted_at is null;
 if v_sender is null or v_sender is distinct from new.owner_account_id then return new; end if;
 if not exists (select 1 from public.v21_accounts a where a.id=v_sender
    and a.role='user' and a.deleted_at is null
    and (a.contact_group='ncc' or exists (
      select 1 from public.chat_ncc_scanner_assignments s
      where s.account_id=a.id and s.enabled=true))) then return new; end if;
 v_hash:=case when new.content_hash ~ '^[0-9a-fA-F]{64}$' then lower(new.content_hash) else null end;
 insert into public.chat_ncc_invoices(chat_account_id,conversation_id,message_id,media_asset_id,image_sha256)
 values (v_sender,new.conversation_id,new.message_id,new.id,v_hash)
 on conflict do nothing;
 return new;
end;
$$;
revoke all on function public.chat_ncc_queue_received_image() from public,anon,authenticated;
drop trigger if exists chat_ncc_media_received on public.v21_media_assets;
create trigger chat_ncc_media_received
 after insert or update of message_id,owner_account_id,deleted_at,kind
 on public.v21_media_assets for each row
 execute function public.chat_ncc_queue_received_image();
),
 check (manual_fingerprint is null or manual_fingerprint ~ '^[0-9a-f]{64}
);
create unique index if not exists chat_ncc_invoice_number_unique
 on public.chat_ncc_invoices(chat_account_id,invoice_date,lower(btrim(invoice_number)))
 where invoice_date is not null and invoice_number is not null and status <> 'duplicate';
create unique index if not exists chat_ncc_invoice_image_unique
 on public.chat_ncc_invoices(chat_account_id,image_sha256)
 where image_sha256 is not null and status <> 'duplicate';
create index if not exists chat_ncc_invoice_queue
 on public.chat_ncc_invoices(status,created_at) where status in ('pending','needs_review');
create table if not exists public.chat_ncc_invoice_lines (
 id bigint generated always as identity primary key,
 invoice_id uuid not null references public.chat_ncc_invoices(id) on delete cascade,
 row_no integer not null check (row_no > 0),
 printed_name text not null,
 quantity numeric not null check (quantity > 0),
 printed_unit text,
 unit_price_vnd numeric not null check (unit_price_vnd >= 0),
 line_total_vnd numeric not null check (line_total_vnd >= 0),
 product_code text references public.taphoa_products(product_code),
 match_method text not null default 'unmatched' check (match_method in ('unmatched','exact','alias','manual')),
 unit_factor numeric check (unit_factor is null or unit_factor > 0),
 normalized_cost_vnd numeric check (normalized_cost_vnd is null or normalized_cost_vnd >= 0),
 review_required boolean not null default true,
 unique(invoice_id,row_no)
);
create table if not exists public.chat_ncc_product_aliases (
 chat_account_id uuid not null references public.v21_accounts(id),
 supplier_name_key text not null,
 supplier_unit_key text not null default '',
 product_code text not null references public.taphoa_products(product_code),
 unit_factor numeric not null default 1 check (unit_factor > 0),
 created_at timestamptz not null default now(),
 primary key(chat_account_id,supplier_name_key,supplier_unit_key)
);
-- Service-only storage: no browser writes to private OCR text or product mappings.
alter table public.chat_ncc_invoices enable row level security;
alter table public.chat_ncc_invoice_lines enable row level security;
alter table public.chat_ncc_product_aliases enable row level security;
revoke all on public.chat_ncc_invoices,public.chat_ncc_invoice_lines,public.chat_ncc_product_aliases from public,anon,authenticated;
grant select,insert,update,delete on public.chat_ncc_invoices,public.chat_ncc_invoice_lines,public.chat_ncc_product_aliases to service_role;
grant usage,select on sequence public.chat_ncc_invoice_lines_id_seq to service_role;

create or replace function public.chat_ncc_queue_received_image()
 returns trigger language plpgsql security definer set search_path=public as $$
declare v_sender uuid; v_hash text;
begin
 if new.deleted_at is not null or new.message_id is null
    or new.kind not in ('image','photo') then return new; end if;
 select m.sender_account_id into v_sender from public.v21_messages m
  where m.id=new.message_id and m.conversation_id=new.conversation_id and m.deleted_at is null;
 if v_sender is null or v_sender is distinct from new.owner_account_id then return new; end if;
 if not exists (select 1 from public.v21_accounts a where a.id=v_sender
    and a.role='user' and a.contact_group='ncc' and a.deleted_at is null) then return new; end if;
 v_hash:=case when new.content_hash ~ '^[0-9a-fA-F]{64}$' then lower(new.content_hash) else null end;
 insert into public.chat_ncc_invoices(chat_account_id,conversation_id,message_id,media_asset_id,image_sha256)
 values (v_sender,new.conversation_id,new.message_id,new.id,v_hash)
 on conflict do nothing;
 return new;
end;
$$;
revoke all on function public.chat_ncc_queue_received_image() from public,anon,authenticated;
drop trigger if exists chat_ncc_media_received on public.v21_media_assets;
create trigger chat_ncc_media_received
 after insert or update of message_id,owner_account_id,deleted_at,kind
 on public.v21_media_assets for each row
 execute function public.chat_ncc_queue_received_image();
)
);
create unique index if not exists chat_ncc_invoice_number_unique
 on public.chat_ncc_invoices(chat_account_id,invoice_date,lower(btrim(invoice_number)))
 where invoice_date is not null and invoice_number is not null and status <> 'duplicate';
create unique index if not exists chat_ncc_invoice_image_unique
 on public.chat_ncc_invoices(chat_account_id,image_sha256)
 where image_sha256 is not null and status <> 'duplicate';
create index if not exists chat_ncc_invoice_queue
 on public.chat_ncc_invoices(status,created_at) where status in ('pending','needs_review');
create table if not exists public.chat_ncc_invoice_lines (
 id bigint generated always as identity primary key,
 invoice_id uuid not null references public.chat_ncc_invoices(id) on delete cascade,
 row_no integer not null check (row_no > 0),
 printed_name text not null,
 quantity numeric not null check (quantity > 0),
 printed_unit text,
 unit_price_vnd numeric not null check (unit_price_vnd >= 0),
 line_total_vnd numeric not null check (line_total_vnd >= 0),
 product_code text references public.taphoa_products(product_code),
 match_method text not null default 'unmatched' check (match_method in ('unmatched','exact','alias','manual')),
 unit_factor numeric check (unit_factor is null or unit_factor > 0),
 normalized_cost_vnd numeric check (normalized_cost_vnd is null or normalized_cost_vnd >= 0),
 review_required boolean not null default true,
 unique(invoice_id,row_no)
);
create table if not exists public.chat_ncc_product_aliases (
 chat_account_id uuid not null references public.v21_accounts(id),
 supplier_name_key text not null,
 supplier_unit_key text not null default '',
 product_code text not null references public.taphoa_products(product_code),
 unit_factor numeric not null default 1 check (unit_factor > 0),
 created_at timestamptz not null default now(),
 primary key(chat_account_id,supplier_name_key,supplier_unit_key)
);
-- Service-only storage: no browser writes to private OCR text or product mappings.
alter table public.chat_ncc_invoices enable row level security;
alter table public.chat_ncc_invoice_lines enable row level security;
alter table public.chat_ncc_product_aliases enable row level security;
revoke all on public.chat_ncc_invoices,public.chat_ncc_invoice_lines,public.chat_ncc_product_aliases from public,anon,authenticated;
grant select,insert,update,delete on public.chat_ncc_invoices,public.chat_ncc_invoice_lines,public.chat_ncc_product_aliases to service_role;
grant usage,select on sequence public.chat_ncc_invoice_lines_id_seq to service_role;

create or replace function public.chat_ncc_queue_received_image()
 returns trigger language plpgsql security definer set search_path=public as $$
declare v_sender uuid; v_hash text;
begin
 if new.deleted_at is not null or new.message_id is null
    or new.kind not in ('image','photo') then return new; end if;
 select m.sender_account_id into v_sender from public.v21_messages m
  where m.id=new.message_id and m.conversation_id=new.conversation_id and m.deleted_at is null;
 if v_sender is null or v_sender is distinct from new.owner_account_id then return new; end if;
 if not exists (select 1 from public.v21_accounts a where a.id=v_sender
    and a.role='user' and a.contact_group='ncc' and a.deleted_at is null) then return new; end if;
 v_hash:=case when new.content_hash ~ '^[0-9a-fA-F]{64}$' then lower(new.content_hash) else null end;
 insert into public.chat_ncc_invoices(chat_account_id,conversation_id,message_id,media_asset_id,image_sha256)
 values (v_sender,new.conversation_id,new.message_id,new.id,v_hash)
 on conflict do nothing;
 return new;
end;
$$;
revoke all on function public.chat_ncc_queue_received_image() from public,anon,authenticated;
drop trigger if exists chat_ncc_media_received on public.v21_media_assets;
create trigger chat_ncc_media_received
 after insert or update of message_id,owner_account_id,deleted_at,kind
 on public.v21_media_assets for each row
 execute function public.chat_ncc_queue_received_image();
