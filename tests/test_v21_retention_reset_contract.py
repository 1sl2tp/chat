from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SYNC=(ROOT/'v21-sync-engine.js').read_text('utf-8')
MIG=(ROOT/'supabase'/'migrations'/'20261004193000_chat_operational_retention_guard.sql').read_text('utf-8')

pull=SYNC[SYNC.index("async function pullAll()"):SYNC.index("async function applySnapshot")]
assert "if(data?.reset_required===true){" in pull
assert "await initializeFromServer();" in pull
assert "return total;" in pull

# Canonical chat data must never be part of the retention DELETE set.
for forbidden in (
    "delete from public.v21_messages",
    "delete from public.v21_read_states",
    "delete from public.v21_conversations",
    "delete from public.v21_media_assets",
):
    assert forbidden not in MIG.lower()

assert "created_at < now() - interval '14 days'" in MIG
assert "state in ('sent','dead')" in MIG
assert "revoked_at < now() - interval '30 days'" in MIG
assert "status='failed' and finished_at < now() - interval '7 days'" in MIG
assert "status='done' and finished_at < now() - interval '30 days'" in MIG
assert "limit 10000" in MIG
assert "'43 3 * * *'" in MIG

print("V21 operational retention + reset-to-snapshot contract PASS")
