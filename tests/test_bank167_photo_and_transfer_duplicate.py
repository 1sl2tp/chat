"""BANK-167: prioritise M1 amount/time under poor photos and block rephotographed payment replay."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
EDGE=(ROOT/"supabase/functions/v21-bank-bill-event/index.ts").read_text(encoding="utf-8")
RULES=(ROOT/"supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs").read_text(encoding="utf-8")
PREVIEW=(ROOT/"supabase/functions/v21-bank-bill-event/bill-app-preview.mjs").read_text(encoding="utf-8")

def test_vision_reads_payment_amount_and_transaction_time_first():
    assert RULES.index("1) SỐ TIỀN")<RULES.index("2) NGÀY GIỜ TRÊN BILL")
    assert RULES.index("2) NGÀY GIỜ TRÊN BILL")<RULES.index("3) TÊN NGƯỜI NHẬN")
    assert RULES.index("3) TÊN NGƯỜI NHẬN")<RULES.index("4) ĐUÔI SỐ TÀI KHOẢN")
    for text in ("mặt bàn","thiếu sáng","lóa","mờ","transaction_datetime_vn=null","amount_clear=false"):
        assert text in RULES
    assert "recipient_account_last5" in RULES
    assert "Không biết ngày/giờ -> null" in RULES

def test_same_bank_credit_or_transaction_reference_is_seen_as_duplicate_even_if_hash_differs():
    assert "async function findAlreadyCollectedTransfer(" in EDGE
    assert '.from("chat_bank_app_collection_links")' in EDGE
    assert '.eq("notification_id",appMatch.notification_id)' in EDGE
    assert '.eq("transfer_reference",ref).eq("amount_vnd",amount)' in EDGE
    assert 'Math.abs(old-tx)<=5*60000' in EDGE
    assert '"duplicate_transfer_already_collected"' in EDGE
    assert 'duplicate_of:settledDuplicate?prior.receipt_id:null' in EDGE
    assert 'status:classification,reason:classificationReason' in EDGE
    assert 'if(prior){' in EDGE
    assert "ledger_written:false,duplicate_of:prior.receipt_id" in EDGE
    assert '"bank_transfer_already_used_by_other_customer"' in EDGE

def test_test_chat_duplicate_status_distinguishes_already_collected_bill():
    assert 'alreadyCollectedForCustomer=original?.status==="received"' in EDGE
    assert "đã được ghi thu trước đó. Không thu thêm." in EDGE
    assert "Ảnh đã được gửi trước đó. Không ghi thu lần hai" in EDGE
    assert "Chỉ kiểm tra ảnh, CHƯA GHI THU." not in EDGE
    assert "if(originalError)return false;" in EDGE

def test_credit_event_uses_true_printed_bank_transaction_datetime():
    assert "if(!m)return null;" in PREVIEW
    assert "bankEventTime(e)" in PREVIEW
    assert "when(e.posted_at)" in PREVIEW
    assert 'another_bill_same_time_amount' in PREVIEW
    assert 'recipient_account_conflict' in PREVIEW
