"""BANK-166: amount/time primary; receiver details optional but contradictions blocked."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
M=(ROOT/"supabase/migrations/20261019093500_bank166_optional_recipient_tiers.sql").read_text(encoding="utf-8").lower()
WAKE=(ROOT/"supabase/migrations/20261019094000_bank166_app_wake_15min_push.sql").read_text(encoding="utf-8").lower()
EDGE=(ROOT/"supabase/functions/v21-bank-bill-event/index.ts").read_text(encoding="utf-8")
PREVIEW=(ROOT/"supabase/functions/v21-bank-bill-event/bill-app-preview.mjs").read_text(encoding="utf-8")

def test_tier_1_verified_credit_and_image_is_mandatory():
 assert "not(config.enabled and config.ready)" in M
 assert "r.status <> 'amount_read'" in M
 assert "transfer_amount<>r.amount_vnd" in M
 assert "transfer_amount<>n.amount_vnd" in M
 assert "abs(extract(epoch from(image_at-transaction_at)))>300" in M
 assert "r.raw_read#>>'{match_preview,status}'<>'candidate_unique'" in M
 assert "recipient_name_conflict" in M
 assert "recipient_bank_conflict" in M
 assert "recipient_account_conflict" in M
 assert "recipient_not_verified" not in M
 assert "nullif(btrim(coalesce(r.receiving_name,'')),'') is not null" in M
 assert "nullif(btrim(coalesce(r.receiving_bank,'')),'') is not null" in M
 assert "length(r.receiving_account) between 11 and length(account_number)-1" in M
def test_keep_unique_credit_bill_and_protected_ledger():
 assert "pg_advisory_xact_lock(17812026)" in M
 assert "from public.chat_bank_app_collection_links l" in M
 assert "duplicate_or_ambiguous" in M
 assert "possible_manual_collection" in M
 assert "taphoa_chat_notify_customer" in M
 assert "insert into public.taphoa_debt_ledger" in M
 assert "insert into public.chat_bank_app_collection_links" in M
 assert "'collection',-thousands" in M
 assert "chat_outbound_allowed" in M
def test_use_printed_bank_transaction_time_in_all_preview_paths():
 assert "function bankeventtime(event)" in PREVIEW.lower()
 assert "match_level:matchLevel" in PREVIEW
 assert "recipient_name_conflict" in PREVIEW
 assert "recipient_bank_conflict" in PREVIEW
 assert "recipient_account_conflict" in PREVIEW
 assert EDGE.count('.select("id,package_name,posted_at,status,amount_vnd,body")')==3
 assert 'new Date(sent+15*60000)' in EDGE
 assert 'new Date(sentMillis+15*60000)' in EDGE
 assert 'new Date(billSentMs+15*60000)' in EDGE
 assert "new.posted_at-interval '15 minutes'" in WAKE
 assert "or n.posted_at>r.sent_at+interval '15 minutes'" in M
