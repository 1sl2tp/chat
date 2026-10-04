from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SYNC=(ROOT/"v21-sync-engine.js").read_text(encoding="utf-8")
MIGRATION=(ROOT/"supabase/migrations/20261005011900_offline_contact_zalo_delivery_contract.sql").read_text(encoding="utf-8")
LEGACY=(ROOT/"supabase/migrations/20260911_zalo_user_link_bridge.sql").read_text(encoding="utf-8")


def test_offline_contact_directory_repairs_once_on_authenticated_bootstrap():
    assert "Directory membership is canonical account data, never Presence/session state." in SYNC
    assert "if(online())queueMicrotask(()=>{void syncContacts();});" in SYNC


def test_zalo_outbound_is_not_gated_by_chat_presence():
    assert "from public.v21_sessions" not in LEGACY.lower()
    assert "from public.zalo_user_links" in LEGACY.lower()
    assert "direction,state,attempt_count" in LEGACY


def test_manual_zalo_outbound_signal_has_no_night_suppression():
    lower=MIGRATION.lower()
    assert "zalo_outbound_signal" in lower
    assert "time '05:00'" not in lower
    assert "taphoa-zalo.onrender.com/outbound-now" in lower
