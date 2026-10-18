"""BANK-157: fail-closed auto-collection Admin settings contract."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261018160348_chat_auto_collect_admin_settings_disabled_foundation.sql"
UI = ROOT / "zalo-admin-link.js"


def test_disabled_default_and_hard_readiness_gate():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "enabled boolean not null default false" in sql
    assert "ready boolean not null default false" in sql
    assert "if p_enabled and not v_config.ready then" in sql
    assert "auto_collect_not_ready" in sql
    assert "current_active_account_id()" in sql
    assert "a.role='admin'" in sql
    assert "a.deleted_at is null" in sql
    assert "a.locked_at is null" in sql
    assert "revoke all on table public.chat_auto_collect_settings from public, anon, authenticated;" in sql
    assert "grant execute on function public.chat_auto_collect_admin_settings(boolean) to authenticated;" in sql


def test_admin_ui_is_server_backed_and_initially_off():
    js = UI.read_text(encoding="utf-8")
    assert 'data-admin-auto-collect-setting' in js
    assert 'data-admin-auto-collect-action data-mode="enable" data-unavailable="true" disabled' in js
    assert "client.rpc('chat_auto_collect_admin_settings',{p_enabled:null})" in js
    assert "client.rpc('chat_auto_collect_admin_settings',{p_enabled:enable})" in js
    assert "if(!root||!currentAdmin())return;" in js
    assert "action.disabled=accountBusy||autoCollectRequestBusy||action.dataset.unavailable==='true'" in js
    assert "void refreshAutoCollectSetting();" in js
    assert "runAutoCollectAction(autoCollectAction)" in js


def test_setting_only_does_not_enable_bank_work_or_write_ledger():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "insert into public.taphoa_debt_ledger" not in sql
    assert "update public.taphoa_debt_ledger" not in sql
    assert "net.http_post" not in sql
    assert "create trigger" not in sql
    assert "cron" not in sql.lower().split("begin;")[1]
