from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / 'admin-composer-actions.js').read_text()
HTML = (ROOT / 'index.source.html').read_text()
CSS = (ROOT / 'admin-composer-actions.css').read_text()
BANK = (ROOT / 'bank-report-dashboard.js').read_text()
SQL = (ROOT / 'supabase/migrations/20261024061500_ux192_quick_cash_command_units.sql').read_text()

def test_customer_shortcuts_are_contextual_and_do_not_replace_composer():
    for action in ('cash', 'debt', 'photos', 'recent'):
        assert 'data-chat-quick="' + action + '"' in HTML
    assert 'id="chatQuickActions"' in HTML
    assert 'aria-label="Thao tác nhanh cho khách hàng"' in HTML
    assert 'id="composer-plus-btn"' in HTML
    assert "quickCustomerGroup()==='customer'" in JS
    assert "route==='chat'" in JS
    assert 'if(!visible)closeQuickRecent()' in JS
    assert "activeContactId()" in JS
    assert 'quickCustomerId()' in JS
    assert "messageId===shellId" in JS
    assert 'rememberCurrentCustomer()' in JS
    assert 'data-keyboard-open="true"' in CSS
    assert 'data-bank-report-active="true"' in CSS

def test_cash_has_explicit_confirmation_stable_retry_and_role_guard():
    for fragment in ("Thu tiền mặt", "Thu tiền mặt nhập tay", "Nội dung thu", "data-cash-confirm",
                     "chat_admin_quick_cash_collect", "p_command_id:commandId",
                     "One stable idempotency key", "amount.value", "cashThousandsToVnd",
                     "quickCustomerId()!==String(contactId)", "another_dialog_open",
                     "notice_sent", "Đã ghi thu tiền mặt"):
        assert fragment in JS or fragment in SQL, fragment
    assert JS.index('const commandId=') < JS.index("form.addEventListener('submit',async event=>")
    assert "PERFORM pg_advisory_xact_lock" in SQL
    assert "v21_private.require_active_account(p_app_session_id)" in SQL
    assert "a.role='admin'" in SQL
    assert "a.contact_group='customer'" in SQL
    assert "FROM public.taphoa_command_log" in SQL
    assert "IF FOUND THEN" in SQL
    assert "command_id_conflict" in SQL
    assert "INSERT INTO public.taphoa_debt_ledger" in SQL
    assert "'collection',-v_amount" in SQL
    assert "'amount_vnd',v_amount,'source_amount_vnd',p_amount_vnd" in SQL
    assert "taphoa_chat_notify_customer" in SQL
    assert "REVOKE ALL ON FUNCTION public.chat_admin_quick_cash_collect" in SQL

def test_bank_direct_action_still_requires_server_confirmation():
    assert "bank-report-quick-collect" in BANK
    assert "event.preventDefault();event.stopPropagation()" in BANK
    assert "void openCollectionDialog(row)" in BANK
    assert "client.rpc('chat_bank_manual_collect'" in BANK
    assert "Promise.all([" in BANK
    assert "const expanded=new Set" in BANK
    assert "if(expanded.has(key))node.open=true" in BANK
    assert "Agribank cần xử lý" in BANK
    assert "Đã thu thủ công" in BANK
