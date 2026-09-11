from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/'supabase/migrations/20260911_admin_web_push.sql').read_text('utf-8')

for token in [
    'create table if not exists public.v21_push_subscriptions',
    'create table if not exists public.v21_push_outbox',
    'unique(message_id,recipient_account_id)',
    'create or replace function v21_private.enqueue_admin_push()',
    "v_sender_role<>'user'",
    "v_recipient_role<>'admin'",
    'create or replace function public.v21_admin_push_claim',
    'for update skip locked',
    'create or replace function public.v21_admin_push_result',
    'grant execute on function public.v21_admin_push_claim(integer) to service_role',
]:
    assert token.replace(' ','') in SQL.replace(' ',''), token

assert 'grant select on public.v21_push_subscriptions to authenticated' not in SQL.lower()
assert 'grant select on public.v21_push_outbox to authenticated' not in SQL.lower()
