from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/'supabase/migrations/20261020214000_bank184_admin_exception_evidence_audit.sql').read_text()
JS=(ROOT/'bank-report-dashboard.js').read_text()
CSS=(ROOT/'bank-report-dashboard.css').read_text()
HTML=(ROOT/'index.source.html').read_text()

def test_admin_only_review_audit_and_no_ledger_side_effects():
    assert 'CREATE TABLE IF NOT EXISTS public.chat_bank_manual_exception_reviews' in SQL
    assert 'ALTER TABLE public.chat_bank_manual_exception_reviews ENABLE ROW LEVEL SECURITY' in SQL
    assert 'REVOKE ALL ON public.chat_bank_manual_exception_reviews FROM PUBLIC,anon,authenticated' in SQL
    assert "v_admin:=v21_private.require_active_account(p_app_session_id)" in SQL
    assert "AND a.role='admin'" in SQL
    assert "length(btrim(coalesce(p_explanation,'')))<30" in SQL
    assert "p_original_checked IS DISTINCT FROM true" in SQL
    assert "v_receipt.customer_account_id" in SQL
    assert "media.owner_account_id=a.id" in SQL
    assert "m.sender_account_id=a.id" in SQL
    assert "other.customer_account_id=v_receipt.customer_account_id" in SQL
    assert "l.notification_id=p_notice_id OR l.receipt_id=p_primary_receipt_id" in SQL
    assert "'BUI XUAN TUNG chuyen tien'" in SQL
    assert "v_notice.is_own_transfer IS DISTINCT FROM FALSE" in SQL
    assert "v_notice.bank_credit_account IS DISTINCT FROM '2901181999999'" in SQL
    assert "'requires_additional_proof'" in SQL
    assert "'evidence_reviewed_pending_collection'" in SQL
    assert "UNIQUE(notice_id,primary_receipt_id)" in SQL
    assert "jsonb_build_object('ok',true,'review_id',v_id" in SQL
    assert "'ledger_written',false" in SQL
    write_section=SQL.split('CREATE OR REPLACE FUNCTION public.chat_bank_manual_exception_record',1)[1]
    assert 'INSERT INTO public.chat_bank_manual_exception_reviews' in write_section
    for bad in ('INSERT INTO public.taphoa_debt_ledger',
                'UPDATE public.chat_bank_bill_receipts',
                'INSERT INTO public.chat_bank_app_collection_links',
                'PERFORM public.chat_bank_app_collect'):
        assert bad not in write_section
    assert 'GRANT EXECUTE ON FUNCTION public.chat_bank_manual_exception_record' in SQL

def test_user_sees_exact_receipts_and_mandatory_explanation():
    for fragment in ("data-bank-review-modal","data-bank-viewer"):
        assert fragment in HTML
    for fragment in ("function openReviewDialog(", "function closeReviewDialog(",
                     "Xem ảnh","Lập biên bản ngoại lệ",
                     "Chọn nguyên nhân…", "Tôi đã trực tiếp kiểm tra ảnh gốc",
                     "Giải trình (bắt buộc, tối thiểu 30 ký tự)",
                     "chat_bank_manual_exception_get",
                     "chat_bank_manual_exception_record",
                     "p_original_checked:true","ledger_written!==false",
                     "Chưa ghi thu công nợ","requires_additional_proof",
                     "selected.customer_id","p_supporting_receipt_ids:support"):
        assert fragment in JS,fragment
    assert 'bank-review-overlay' in CSS
    assert 'env(safe-area-inset-bottom,0px)' in CSS
    assert "current=data;paint(data)" in JS

def test_ambiguous_multi_transaction_photo_stays_review_not_collection():
    assert "b.amount_vnd==null&&b.status==='review'" in JS
    assert "b.reason==='multiple_transactions_ambiguous'" in JS
    assert "String(b.sent_at||'').slice(0,10)" in JS
    assert "v_receipt.amount_vnd=v_notice.amount_vnd" in SQL
    assert "v_receipt.raw_read->>'image_type'='successful_transfer_receipt'" in SQL
    assert "v_receipt.status='amount_read'" in SQL
    assert "ELSE 'requires_additional_proof'" in SQL
