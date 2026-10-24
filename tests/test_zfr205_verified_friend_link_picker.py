"""ZFR-205: newly confirmed Zalo friends immediately appear in Admin link picker."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/'supabase/migrations/20261024122000_zfr205_make_verified_friend_selectable.sql').read_text('utf-8')
EDGE=(ROOT/'supabase/functions/v21-zalo-admin/index.ts').read_text('utf-8')
CLIENT=(ROOT/'zalo-admin-link.js').read_text('utf-8')

def test_verified_friend_is_inserted_into_picker_directory():
    assert 'CREATE TRIGGER trg_chat_zalo_verified_friend_contact' in SQL
    assert 'AFTER UPDATE OF confirmed_at' in SQL
    assert 'NEW.confirmed_at IS NOT NULL AND OLD.confirmed_at IS NULL' in SQL
    assert "NEW.zalo_id ~ '^[0-9]{5,32}$'" in SQL
    assert 'INSERT INTO public.zalo_contacts' in SQL
    assert 'ON CONFLICT(zalo_id) DO NOTHING' in SQL
    assert 'WHERE j.confirmed_at IS NOT NULL' in SQL
    assert "j.status IN ('sent','already_sent','already_friends','unknown','accepted')" in SQL

def test_no_automatic_wrong_account_link_or_duplicate_chat_user():
    assert 'INSERT INTO public.zalo_user_links' not in SQL
    assert 'INSERT INTO public.v21_accounts' not in SQL
    assert '.from("zalo_contacts")' in EDGE
    assert 'async function loadAdminSnapshot' in EDGE
    assert "action:'link'" in CLIENT
    assert "openAccountPicker(account)" in CLIENT

def test_admin_history_includes_zalo_id_to_enable_followup_linking():
    assert '.select("id,phone,status,zalo_id,zalo_name' in EDGE
