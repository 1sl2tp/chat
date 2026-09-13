from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
EDGE=ROOT/'supabase/functions/v21-order-source/index.ts'
CORE=ROOT/'supabase/functions/v21-order-source/source-core.mjs'
assert EDGE.exists() and CORE.exists()
text=EDGE.read_text(encoding='utf-8').lower()
compact=''.join(text.split())
assert 'db.auth.getuser' in compact
assert "eq('role','admin')" in compact or 'eq("role","admin")' in compact
assert 'v21_conversations' in text and 'v21_messages' in text
assert "eq('sender_account_id',contactid)" in compact or 'eq("sender_account_id",contactid)' in compact
assert "gte('created_at',from)" in compact or 'gte("created_at",from)' in compact
assert "lt('created_at',to)" in compact or 'lt("created_at",to)' in compact

# Image-only customer messages belong to the time-based Chat summary even when body is empty.
assert 'v21_media_assets' in text
assert "eq('kind','image')" in compact or 'eq("kind","image")' in compact
assert 'imageassets' in text
assert 'assetid' in text
assert '.not(\'body\',\'is\',null)' not in compact and '.not("body","is",null)' not in compact

for action in ["action==='list'","action==='set_state'","action==='mark_imported'"]:
    assert action in compact

print('customer order source Edge contract PASS')
