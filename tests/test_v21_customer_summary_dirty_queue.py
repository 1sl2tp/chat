from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
migration = ROOT / 'supabase/migrations/20260915_customer_summary_dirty_queue.sql'
edge = ROOT / 'supabase/functions/v21-customer-summary-scan/index.ts'

assert migration.exists(), 'dirty queue migration is missing'
assert edge.exists(), 'customer summary edge function is missing'

m = migration.read_text('utf-8').lower()
e = edge.read_text('utf-8')
el = e.lower()

# Queue state is versioned so a newer customer message cannot be cleared by an older scan.
for token in ('dirty_version', 'processed_version', 'claimed_version', 'claim_started_at'):
    assert token in m, f'missing queue state column/field: {token}'

# Only customer-authored changes (and their images) should mark a customer dirty.
assert 'v21_messages' in m and 'sender_account_id' in m and "contact_group='customer'" in m.replace(' ', ''), 'customer messages must mark dirty'
assert 'v21_media_assets' in m and "kind='image'" in m.replace(' ', ''), 'new customer images must mark dirty'
assert 'dirty_version = ' in m or 'dirty_version=' in m, 'dirty marker must advance a version instead of a lossy boolean'

# Cron still runs every minute, but claim only takes dirty customers and never more than 15.
assert 'chat_customer_summary_claim_dirty_batch' in m, 'dirty-only claim RPC is missing'
assert 'dirty_version > processed_version' in m or 'dirty_version>processed_version' in m, 'clean customers must not be claimed'
assert 'limit 15' in m or 'least(15' in m, 'dirty claim must remain capped at 15 customers per minute'
assert 'claim_started_at' in m and ('interval \'2 minutes\'' in m or 'interval \'3 minutes\'' in m), 'stale claims must be retryable without duplicate concurrent scans'

# Success advances only the claimed version. A newer message leaves dirty_version ahead for the next minute.
assert 'chat_customer_summary_finish_success' in m, 'success acknowledgement RPC is missing'
assert 'p_claim_version' in m, 'success acknowledgement needs the claimed version token'
assert 'processed_version' in m and 'greatest' in m, 'success must advance processed_version atomically'
assert 'dirty_version' in m, 'success logic must compare against current dirty version'

# Failure releases the claim but must NOT advance processed_version, so the same customer retries next minute.
assert 'chat_customer_summary_finish_failure' in m, 'failure acknowledgement RPC is missing'
failure_section = m[m.find('chat_customer_summary_finish_failure'):]
assert 'processed_version =' not in failure_section and 'processed_version=' not in failure_section, 'failed scan must remain dirty for retry'

# Edge runtime must use the dirty queue token end-to-end rather than round-robin last_scanned_at.
assert 'chat_customer_summary_claim_dirty_batch' in el, 'edge runtime must claim dirty customers only'
assert 'claim_version' in el, 'edge runtime must preserve the queue claim token'
assert 'chat_customer_summary_finish_success' in el, 'edge runtime must acknowledge successful scans'
assert 'chat_customer_summary_finish_failure' in el, 'edge runtime must release failed scans for retry'
assert "from('chat_customer_summary_state').upsert" not in e.replace(' ', ''), 'edge runtime must not bypass atomic dirty queue acknowledgement with a state upsert'

print('Customer summary dirty queue PASS')
