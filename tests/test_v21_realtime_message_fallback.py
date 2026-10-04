from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RT=(ROOT/'v21-realtime-session.js').read_text('utf-8')

assert "table:'v21_sync_events'" in RT
assert "filter:`target_account_id=eq.${s.account.id}`" in RT
assert "table:'v21_messages'" in RT
assert "reason:'realtime-message-fallback'" in RT

sync_pos=RT.index("table:'v21_sync_events'")
message_pos=RT.index("table:'v21_messages'")
session_pos=RT.index("table:'v21_session_events'")
assert sync_pos < message_pos < session_pos

# Direct message fallback must not apply/render data itself. It only wakes the
# canonical SyncEngine, so duplicate Realtime signals cannot create duplicates.
fallback=RT[message_pos:session_pos]
assert "sync()?.wake?.({reason:'realtime-message-fallback'})" in fallback
assert "messages()?.apply" not in fallback
assert "setInterval" not in fallback

print("V21 realtime message fallback contract PASS")

assert "const PRESENCE_INTERACTION_MIN_MS=5000;" in RT
assert "schedulePresencePublish(PRESENCE_INTERACTION_MIN_MS);" in RT
assert "if(presencePublishTimer&&!replace)return false;" in RT
assert "schedulePresencePublish(350);" not in RT
assert "visibilitychange',()=>{\n  schedulePresencePublish(0,{replace:true});" in RT

print("V21 realtime presence throttle contract PASS")
