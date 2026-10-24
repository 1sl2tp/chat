"""BANK-209/210: receipts are visible only after a real ledger movement.
Regression for C Sâm PL: 512k already acknowledged, four subsequent auto-
collections were booked but their Chat notices were suppressed by BANK-202.
"""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ACK=(ROOT/'supabase/migrations/20261024164000_bank209_verified_collection_acks.sql').read_text('utf-8')
STATUS=(ROOT/'supabase/migrations/20261024164500_bank210_clear_received_waiting_review.sql').read_text('utf-8')
UI=(ROOT/'bank-report-dashboard.js').read_text('utf-8')

def test_auto_notice_requires_bank_bill_and_actual_debt_posting():
    for token in (
      'r.status=\'received\' AND r.ledger_id=l.ledger_id',
      'n.amount_vnd=r.amount_vnd',
      "n.is_own_transfer IS FALSE",
      "d.entry_type='collection'",
      "d.amount_vnd=-(r.amount_vnd::numeric/1000)",
      "r.balance_before_thousands IS NOT NULL",
      "r.balance_after_thousands IS NOT NULL",
      "public.taphoa_chat_notify_customer",
      "msg.client_id",
      "pg_try_advisory_xact_lock",
      "ON CONFLICT(receipt_id)",
      "WHERE public.chat_bank_auto_collection_ack.status='retry'",
    ):
      if token=="msg.client_id":
        assert "m.client_id='taphoa:'||x.receipt_id::text||':collection'" in ACK
      else: assert token in ACK,token
    assert 'INSERT INTO public.taphoa_debt_ledger' not in ACK
    assert 'UPDATE public.taphoa_debt_ledger' not in ACK
    assert 'taphoa-bank-auto-collection-ack-v1' in ACK
    assert '*/2 * * * *' in ACK
    assert "REVOKE ALL ON FUNCTION public.chat_bank_auto_collection_ack_drain(integer)" in ACK
    assert "TO service_role;" in ACK

def test_matched_requires_verified_posting_and_49k_is_review():
    assert 'BANK-210: verified posted collection status' in STATUS
    assert "AND d.id IS NOT NULL AND n.amount_vnd=r.amount_vnd" in STATUS
    assert "possible.amount_vnd=r.amount_vnd" in STATUS
    assert "possible.is_own_transfer IS FALSE" in STATUS
    assert "THEN ''review''" in STATUS
    assert "THEN ''waiting_bank''" in STATUS
    assert "r.transfer_at_vn IS NULL OR r.transfer_at_vn::date=p_day" in STATUS
    assert "d.entry_type=''collection''" in STATUS

def test_dashboard_labels_no_false_paid_message():
    notice=(ROOT/'supabase/migrations/20261024165000_bank211_receipt_notice_state.sql').read_text('utf-8')
    assert "collection_notice_state" in notice
    for token in (
       "matched:'Đã thu · Đối soát'",
       "waiting_bank:'Chờ Agribank · Chưa thu'",
       "review:'Cần kiểm tra · Chưa thu'",
       "cardValue('Bill chưa ghi thu'",
       "cardValue('Đã thu có chứng từ'",
       "recorded?'Đã ghi thu · Sổ #'+row.ledger_id:'Chưa ghi thu'",
       "row.collection_ack_sent?'Đã gửi cho khách'",
       "noticeState==='muted'?'Đã tắt theo cài đặt thông báo'",
       "noticeState==='retry'?'Gửi lỗi · Hệ thống sẽ thử lại'",
       "row.reason==='bank_image_amount_only_no_collection'",
       "Chưa ghi thu.",
    ): assert token in UI,token
