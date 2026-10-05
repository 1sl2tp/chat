from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MIG=(ROOT/'supabase/migrations/20261006033500_chat_auto_receipt_collection.sql').read_text('utf-8')
EDGE=(ROOT/'supabase/functions/v21-receipt-scan/index.ts').read_text('utf-8')

# Exact recipient identity is enforced in Postgres, never by UI.
assert "v_name_norm <> 'BUI XUAN TUNG'" in MIG
assert "v_account_norm <> '2901181999999'" in MIG
assert "position('AGRIBANK' in v_bank_norm)=0" in MIG

# Do not weaken to suffix matching.
assert "right(v_account_norm" not in MIG.lower()
assert "endswith" not in MIG.lower()

# AI extracts what it sees and is not primed with the expected recipient.
assert "BUI XUAN TUNG" not in EDGE
assert "2901181999999" not in EDGE
assert "không suy đoán" in EDGE
assert "recipient_account" in EDGE

# Only indebted customers' new canonical images are scanned.
assert "taphoa_chat_customer_balance_value(v_customer.id) <= 0" in MIG
assert "after insert or update of message_id,deleted_at,kind,storage_key" in MIG.lower()

# Bank VND -> TAPHOA ledger thousand-VND unit, exact whole-thousand only.
assert "mod(v_amount,1000)<>0" in MIG.replace(" ","")
assert "v_amount_ledger := v_amount / 1000;" in MIG

# Receipt time must be close to the actual message time.
assert "v_message_at - interval '24 hours'" in MIG
assert "v_message_at + interval '10 minutes'" in MIG

# Duplicate protection: same transfer timestamp always blocks; transaction ref is
# a second independent duplicate key when available.
assert "agribank:2901181999999:at:" in MIG
assert "v_ref_norm<>''" in MIG
assert "regexp_replace(coalesce(j.transaction_ref" in MIG
assert "duplicate_receipt" in MIG

# Auto collection writes canonical debt ledger and sends canonical Chat receipt.
assert "insert into public.taphoa_debt_ledger" in MIG.lower()
assert "'collection'" in MIG
assert "taphoa_chat_notify_customer" in MIG
assert "taphoa_bump_revision('debt')" in MIG

print("V21 exact bank receipt auto-collection contract PASS")
