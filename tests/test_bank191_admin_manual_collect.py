from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "supabase/migrations/20261024051000_bank191_admin_manual_agribank_collection.sql").read_text()
AUTO_GUARD = (ROOT / "supabase/migrations/20261024051500_bank191_guard_auto_after_manual.sql").read_text()
JS = (ROOT / "bank-report-dashboard.js").read_text()
CSS = (ROOT / "bank-report-dashboard.css").read_text()

def test_collection_is_server_authorized_and_audited():
    assert "chat_bank_manual_collections" in SQL
    assert "notification_id bigint PRIMARY KEY" in SQL
    assert "ledger_id bigint NOT NULL UNIQUE" in SQL
    assert "ENABLE ROW LEVEL SECURITY" in SQL
    assert "REVOKE ALL ON public.chat_bank_manual_collections FROM PUBLIC,anon,authenticated" in SQL
    for name in ("chat_bank_manual_collection_statuses", "chat_bank_manual_collection_prepare", "chat_bank_manual_collect"):
        assert "FUNCTION public." + name in SQL
    assert SQL.count("v21_private.require_active_account(p_app_session_id)") == 3
    assert SQL.count("a.role='admin'") == 3
    assert "IF length(btrim(coalesce(p_note,''))) NOT BETWEEN 5 AND 1000" in SQL
    assert "bank_credit_account IS DISTINCT FROM '2901181999999'" in SQL
    assert "v_notice.is_own_transfer IS DISTINCT FROM false" in SQL
    assert "v_notice.package_name IS DISTINCT FROM 'com.vnpay.Agribank3g'" in SQL
    assert "PERFORM pg_advisory_xact_lock(17812026)" in SQL
    assert "FOR UPDATE" in SQL
    assert "SELECT * INTO v_existing FROM public.chat_bank_manual_collections" in SQL
    assert "'already_auto_collected'" in SQL
    assert "'possible_manual_collection'" in SQL
    assert "VALUES (p_customer_id,'collection',-v_thousands" in SQL
    assert "'linked_existing'" in SQL
    assert "v_mode='collected'" in SQL
    assert "PERFORM public.taphoa_bump_revision('debt')" in SQL
    assert "taphoa_chat_notify_customer" in SQL
    assert "taphoa_debt_ledger" in SQL
    assert "PERFORM v21_private.chat_bank_report_touch()" in SQL

def test_auto_collector_knows_manual_source_is_already_accounted():
    assert "public.chat_bank_app_collect(uuid,bigint)" in AUTO_GUARD
    assert "public.chat_bank_manual_collections m where m.notification_id=n.id" in AUTO_GUARD
    assert "already_manual_collected" in AUTO_GUARD

def test_ui_is_true_collection_action_not_just_a_status_toggle():
    for token in ("Thu tiền", "Nội dung thu (bắt buộc)", "Thu tiền Agribank",
                  "chat_bank_manual_collect", "chat_bank_manual_collection_prepare",
                  "chat_bank_manual_collection_statuses", "p_existing_ledger_id",
                  "Đã thu thủ công", "Đã liên kết khoản đã thu", "Không thu lần hai",
                  "bank-report-quick-collect", "manual_bank"):
        assert token in JS, token
    assert "bank-status-bank_manual" in CSS
    # BANK-210 guards a candidate bill against accidental one-tap collection.
    assert "if(isBank&&!manualRecord&&!candidates.length)" in JS
    assert "Thu sau khi xác minh" in JS
