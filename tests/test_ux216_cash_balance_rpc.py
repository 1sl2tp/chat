"""UX-216: Cash dialog gets secure current balance without generating customer links."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
JS=(ROOT/"admin-composer-actions.js").read_text("utf-8")
SQL=(ROOT/"supabase/migrations/20261024184500_ux216_admin_quick_cash_balance_read_only.sql").read_text("utf-8")


def test_cash_balance_is_separate_read_only_admin_rpc():
    assert "FUNCTION public.chat_admin_quick_cash_balance" in SQL
    assert "LANGUAGE plpgsql STABLE SECURITY DEFINER" in SQL
    assert "v21_private.require_active_account(p_app_session_id)" in SQL
    assert "a.role='admin'" in SQL
    assert "a.role='user'" in SQL
    assert "a.contact_group='customer'" in SQL
    assert "a.deleted_at IS NULL" in SQL
    assert "a.locked_at IS NULL" in SQL
    assert "public.taphoa_chat_customer_balance_value(p_customer_id)" in SQL
    assert "'balance_vnd',v_balance_thousands*1000" in SQL
    assert "REVOKE ALL ON FUNCTION public.chat_admin_quick_cash_balance(uuid,uuid)" in SQL
    assert "FROM PUBLIC,anon,authenticated;" in SQL
    assert "TO authenticated;" in SQL
    assert "taphoa_customer_mini_link(" not in SQL
    assert "v21_customer_public_link_info_get_or_create(" not in SQL
    assert "INSERT INTO" not in SQL
    assert "UPDATE public" not in SQL


def test_dialog_reads_balance_once_as_vnd_with_explicit_session_and_safe_reload():
    assert "client.rpc('chat_admin_quick_cash_balance',{" in JS
    assert "p_app_session_id:auth.appSessionId,p_customer_id:String(contactId)" in JS
    assert "const exactVnd=Number(data.balance_vnd);" in JS
    assert "if(!Number.isSafeInteger(exactVnd))" in JS
    assert "data.unit!=='VND'" in JS
    assert "client.rpc('v21_admin_debt_share_summary'" not in JS
    assert "p_amount_vnd:vnd" in JS
    assert "Number(data.source_amount_vnd)!==vnd" in JS
    assert "const latestDebtVnd=await readCurrentDebt();" in JS
    assert "if(latestDebtVnd!==debtVnd)" in JS
    assert "check.checked=false;" in JS
