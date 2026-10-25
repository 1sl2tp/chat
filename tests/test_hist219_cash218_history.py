"""CASH-218 + HIST-219: recover approved missing cash notice and page old chat days."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
APP=(ROOT/"app.js").read_text("utf-8")
HTML=(ROOT/"index.source.html").read_text("utf-8")
SYNC=(ROOT/"v21-sync-engine.js").read_text("utf-8")
STORE=(ROOT/"v21-message-store.js").read_text("utf-8")
CASH=(ROOT/"admin-composer-actions.js").read_text("utf-8")
SQL=(ROOT/"supabase/migrations/20261025085000_hist219_secure_cursor_pagination.sql").read_text("utf-8")
CASH_SQL=(ROOT/"supabase/migrations/20261025081000_cash218_manual_collection_notice_repair.sql").read_text("utf-8")


def test_older_chat_requires_authenticated_membership_and_stable_cursor():
    for phrase in (
        "v21_private.require_active_account(p_app_session_id)",
        "v_me IN(c.member_a,c.member_b)",
        "m.deleted_at IS NULL",
        "p_before_at",
        "p_before_id",
        "m.created_at",
        "m.id",
        "p_conversation_id",
        "v_has_more",
        "'media_assets'",
        "REVOKE ALL ON FUNCTION public.v21_conversation_messages_older",
        "TO authenticated",
    ):
        assert phrase.lower() in SQL.lower(), phrase


def test_older_load_is_scoped_and_not_a_new_message_or_tail_jump():
    assert 'id="historyMoreButton"' in HTML
    assert 'Xem tin / ngày cũ hơn' in HTML
    assert 'data-chat-thread-node' in HTML
    assert "loadOlderHistory()" in APP or "loadOlderHistory?.()" in APP
    assert "renderWindow({preserve:'ANCHOR',historyRestore:true})" in APP
    assert "prependHistory(rows" in STORE
    assert "historyCursor()" in STORE
    assert "loadOlderHistory()" in SYNC
    assert "client.rpc('v21_conversation_messages_older'" in SYNC
    assert "p_before_at:cursor.createdAt,p_before_id:cursor.id" in SYNC
    assert "p_limit:50" in SYNC
    assert "contactEpoch" in SYNC
    assert "messages()?.prependHistory?" in SYNC
    assert "hasMoreOlder" in SYNC
    assert "window.V21ConversationBridge" in APP


def test_manual_collection_notice_uses_existing_outbound_collection_kind():
    assert "fn:=replace(fn" in CASH_SQL
    assert "''taphoa:''||p_command_id::text||'':collection''" in CASH_SQL
    assert "taphoa_chat_notify_customer" in CASH_SQL
    assert "chat_outbound_allowed" in CASH_SQL
    assert "notice_repaired_at" in CASH_SQL
    assert "notice_sent',true" in CASH_SQL
    assert "VALUES (p_customer_id,'collection'" not in CASH_SQL
    assert "INSERT INTO public.taphoa_debt_ledger(" not in CASH_SQL
    assert "UPDATE public.taphoa_debt_ledger" not in CASH_SQL
    assert "data.notice_sent===true" in CASH
    assert "Chưa gửi tin" in CASH
