from pathlib import Path

SQL = Path('supabase/migrations/20260913_chat_call_invites.sql')


def test_call_invite_schema_contract():
    text = SQL.read_text() if SQL.exists() else ''
    required = [
        'create table if not exists public.chat_call_invites',
        'key_hash text not null unique',
        'room_name text not null unique',
        'contact_id text not null',
        'created_by_account_id uuid not null',
        'expires_at timestamptz not null',
        'opened_at timestamptz',
        'guest_joined_at timestamptz',
        'admin_joined_at timestamptz',
        'revoked_at timestamptz',
        'ended_at timestamptz',
        'enable row level security',
        'chat_call_invites_creator_select',
        'alter publication supabase_realtime add table public.chat_call_invites',
    ]
    lower = text.lower()
    for needle in required:
        assert needle.lower() in lower, needle
    assert 'for insert to anon' not in lower
    assert 'for update to anon' not in lower
