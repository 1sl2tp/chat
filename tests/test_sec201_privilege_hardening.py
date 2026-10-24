from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
A=(ROOT/'supabase/migrations/20261024095500_sec201_rpc_privileges_and_search_path.sql').read_text()
B=(ROOT/'supabase/migrations/20261024100000_sec201_block_inherited_public_rpc_execute.sql').read_text()
NODE=json.loads((ROOT/'bridge/zalo/package.json').read_text())

def test_v21_rpc_requires_signed_in_users_not_public():
    endpoints=[
        'v21_auth_logout(uuid)',
        'v21_auth_register_account(text,text,uuid,text,text)',
        'v21_contacts_list(uuid)',
        'v21_conversation_open(uuid,uuid)',
        'v21_mark_read(uuid,uuid)',
        'v21_message_send(uuid,uuid,text,text)',
        'v21_messages_list(uuid,uuid,integer)',
        'v21_sync_pull(uuid,bigint,integer)',
        'v21_unread_count(uuid)',
    ]
    for fn in endpoints:
        assert f'REVOKE EXECUTE ON FUNCTION public.{fn} FROM PUBLIC,anon;' in B,fn
        assert f'GRANT EXECUTE ON FUNCTION public.{fn} TO authenticated,service_role;' in B,fn
    assert 'chat_bank_bill_wake_on_agribank_notification()' in B
    assert 'FROM PUBLIC,anon,authenticated' in B
    assert 'SET search_path=pg_catalog,public,pg_temp' in A

def test_bridge_node_runtime_requires_oct_2026_patched_versions():
    permitted=NODE['engines']['node']
    for spec in ('>=22.23.4 <23','>=24.22.1 <25','>=26.12.1 <27'):
        assert spec in permitted
    assert '>=20' not in permitted
    assert NODE['dependencies']['zca-js']=='2.2.0'
