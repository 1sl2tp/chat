from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261004221254_chat_summary_event_dispatch_sleep_first.sql"
EDGE = ROOT / "supabase/functions/v21-customer-summary-scan/index.ts"

assert MIGRATION.exists(), "sleep-first summary dispatch migration is missing"
assert EDGE.exists(), "customer summary edge function is missing"

m = MIGRATION.read_text("utf-8").lower()
e = EDGE.read_text("utf-8").lower()

# One global lease serializes event wakes; a message burst must not fan out AI workers.
assert "chat_customer_summary_dispatch_state" in m
assert "pg_advisory_xact_lock(hashtext('chat_customer_summary_dispatch'))" in m
assert "lease_until" in m and "interval '10 minutes'" in m
assert "v_acquired" in m and "if v_acquired=0" in m

# Real source changes wake the summary path; opening the Work feed is the recovery wake.
assert "chat_customer_summary_message_dirty_trigger" in m
assert "chat_customer_summary_media_dirty_trigger" in m
assert m.count("perform public.chat_customer_summary_enqueue_if_needed();") >= 3
assert "chat_customer_summary_work_feed" in m

# The old five-minute poller is retained only as rollback metadata and is inactive.
assert "chat-customer-summary-scan-5m" in m
assert "cron.alter_job" in m
assert "active := false" in m

# A scanner releases the lease and chains at most one next dirty batch.
assert "chat_customer_summary_dispatch_finish" in e
assert e.count("await finishdispatch();") >= 2
assert "chat_customer_summary_dispatch_finish" in m
assert "return public.chat_customer_summary_enqueue_if_needed();" in m

# Dispatch is event-driven, not mislabeled as cron traffic.
assert '"trigger":"event"' in m

print("Customer summary event dispatch PASS")
