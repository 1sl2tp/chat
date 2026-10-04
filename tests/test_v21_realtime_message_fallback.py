from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RT=(ROOT/'v21-realtime-session.js').read_text('utf-8')

assert "table:'v21_sync_events'" in RT
assert "filter:`target_account_id=eq.${s.account.id}`" in RT
assert "table:'v21_messages'" in RT
assert "const MESSAGE_FALLBACK_DELAY_MS=250;" in RT
assert "scheduleMessageFallback();" in RT
assert "clearMessageFallback();" in RT
assert "reason:'realtime-message-fallback'" in RT

sync_pos=RT.index("table:'v21_sync_events'")
message_pos=RT.index("table:'v21_messages'")
session_pos=RT.index("table:'v21_session_events'")
assert sync_pos < message_pos < session_pos

fallback=RT[message_pos:session_pos]
assert "scheduleMessageFallback();" in fallback
assert "messages()?.apply" not in fallback
assert "setInterval" not in fallback

mark=RT[RT.index("function markInteraction()"):RT.index("function enqueue(task)")]
assert "lastInteractionAt=Date.now();" in mark
assert "schedulePresencePublish" not in mark
assert "track" not in mark
assert "visibilitychange',()=>{\n  schedulePresencePublish(0,{replace:true});" in RT
assert "navigation-change',()=>schedulePresencePublish(0,{replace:true})" in RT
assert "v21-active-contact-change',()=>schedulePresencePublish(0,{replace:true})" in RT

print("V21 realtime fallback + lifecycle presence contract PASS")
