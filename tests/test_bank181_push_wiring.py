from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MIG=(ROOT/'supabase/migrations/20261020072000_bank181_admin_web_push_outbox.sql').read_text()
EDGE=(ROOT/'supabase/functions/v21-admin-push/index.ts').read_text()
SW=(ROOT/'sw.js').read_text()
CONTROLLER=(ROOT/'admin-push-controller.js').read_text()
DASH=(ROOT/'bank-report-dashboard.js').read_text()

def test_bank_push_fail_closed_and_transactional():
    assert "CREATE TABLE IF NOT EXISTS public.chat_bank_admin_push_outbox" in MIG
    assert "UNIQUE(event_key,recipient_account_id)" in MIG
    assert "new.is_own_transfer IS FALSE" in MIG
    assert "lower(coalesce(v_username,''))='test'" in MIG
    assert "new.bank_credit_account='2901181999999'" in MIG
    assert "new.package_name='com.vnpay.Agribank3g'" in MIG
    assert "new.ledger_id IS NULL THEN RETURN new" in MIG
    assert "new.status NOT IN ('amount_read','review','duplicate')" in MIG
    assert "v_day<>" not in MIG  # day comparison owned by enqueue + printed bill
    assert "new.transfer_at_vn::date=v_day" in MIG
    assert "chat_bank_admin_push_signal_trg" in MIG
    assert "v21_private.admin_push_signal()" in MIG
    assert "GRANT EXECUTE ON FUNCTION public.chat_bank_admin_push_claim" in MIG
    assert "GRANT EXECUTE ON FUNCTION public.chat_bank_admin_push_result" in MIG
    assert "ALTER TABLE public.chat_bank_admin_push_outbox ENABLE ROW LEVEL SECURITY" in MIG

def test_edge_sends_from_canonical_outbox_without_chat_message():
    for token in ("chat_bank_admin_push_claim","chat_bank_admin_push_result",
        "buildBankNotificationPayload","isTestCustomer","validNotice","validLink",
        "alreadyLinked","bank_claimed","deliverToSubscriptions"):
        assert token in EDGE, token
    assert "obsolete_event" in EDGE
    assert "v21_bank_admin_push_claim" not in EDGE
    assert "from(\"v21_messages\").insert" not in EDGE

def test_push_navigation_targets_exact_business_day_and_row():
    for token in ("kind==='bank_reconciliation'","push_bank_day",
        "push_bank_notice","push_bank_receipt","push_bank_status",
        "bankStatus==='matched'","getNotifications"):
        assert token in SW, token
    for token in ("kind==='bank_reconciliation'","bankDay","bankNoticeId",
        "bankReceiptId","V21BankReportDashboard?.openPush"):
        assert token in CONTROLLER, token
    for token in ("function openPush(","function focusPushRecord(",
        "data-bank-receipt-id","bankReceiptId","bankNoticeId","row.open=true"):
        assert token in DASH, token
