"""BANK-213: Collection notice money must follow legacy thousands convention.

A bank/bill amount uses VND at input, but the debt ledger and all customer
collection messages use amount / 1000. Manual cash entry already represents
the number in thousands; do not multiply it twice when displaying.
"""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/"supabase/migrations/20261025072500_bank213_restore_thousands_auto_acks.sql").read_text("utf-8")
ACK=SQL.split("\nDO $bank213$",1)[0]
CASH=(ROOT/"admin-composer-actions.js").read_text("utf-8")
CASH_DB=(ROOT/"supabase/migrations/20261024061500_ux192_quick_cash_command_units.sql").read_text("utf-8")
BASE=(ROOT/"supabase/migrations/20261024060000_ux192_admin_quick_cash_collect.sql").read_text("utf-8")


def test_bank_notice_converts_once_and_uses_original_no_suffix_formatter():
    assert "v_amount:=x.amount_vnd::numeric/1000;" in ACK
    assert "public.taphoa_chat_money(v_amount)" in ACK
    assert "public.taphoa_chat_balance_label(x.balance_before_thousands::numeric,true)" in ACK
    assert "public.taphoa_chat_balance_label(x.balance_after_thousands::numeric,false)" in ACK
    assert "Đã đối soát Agribank · Sổ #" in ACK
    assert "||'đ'" not in ACK
    assert "x.balance_before_thousands*1000" not in ACK
    assert "x.balance_after_thousands*1000" not in ACK
    assert "pg_try_advisory_xact_lock(17812092)" in ACK
    assert "chat_bank_auto_collection_ack" in ACK
    assert "NOT EXISTS (" in ACK


def test_historical_correction_only_touches_verified_system_message_bodies():
    assert "JOIN public.chat_bank_app_collection_links" in SQL
    assert "JOIN public.taphoa_debt_ledger" in SQL
    assert "d.amount_vnd=-(r.amount_vnd::numeric/1000)" in SQL
    assert "m.client_id='taphoa:'||a.receipt_id::text||':collection'" in SQL
    assert "left(x.body,char_length(old_prefix))<>old_prefix" in SQL
    assert "IF suffix<>'' AND suffix NOT LIKE" in SQL
    assert "SET body=new_prefix||suffix" in SQL
    assert "WHERE m.id=x.message_id AND m.body=x.body" in SQL
    assert "UPDATE public.taphoa_debt_ledger" not in SQL
    assert "INSERT INTO public.taphoa_debt_ledger" not in SQL
    assert "DELETE FROM public.taphoa_debt_ledger" not in SQL
    assert "taphoa_chat_notify_customer(" in ACK
    assert "taphoa_chat_notify_customer(" not in SQL.split("\nDO $bank213$",1)[1]


def test_manual_cash_ui_uses_entered_thousands_while_rpc_uses_vnd():
    assert "cashThousandsToVnd(amount.value)" in CASH
    assert "?thousands*1000:null;" in CASH
    assert "p_amount_vnd:vnd" in CASH
    assert "const exactVnd=Number(data.balance_vnd)" in CASH
    assert "cashFormatThousands(vnd)" in CASH
    assert "Number(data.source_amount_vnd)!==vnd" in CASH
    assert "v_amount:=p_amount_vnd::numeric/1000;" in CASH_DB
    assert "'collection',-v_amount" in BASE
