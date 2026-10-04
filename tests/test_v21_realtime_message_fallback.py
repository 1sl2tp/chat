from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RT=(ROOT/'v21-realtime-session.js').read_text('utf-8')

assert "table:'v21_sync_events'" in RT
assert "filter:`target_account_id=eq.${s.account.id}`" in RT
assert "table:'v21_messages'" in RT
assert "const MESSAGE_FALLBACK_DELAY_MS=250;" in RT
assert "pendingMessageFallbackIds=new Set()" in RT
assert "scheduleMessageFallback(String(payload?.new?.id||''));" in RT
assert "clearMessageFallback(String(row?.entity_key||row?.payload?.id||''));" in RT
assert "reason:'realtime-message-fallback'" in RT
assert "consumeRealtimeEvent" in RT
SYNC=(ROOT/'v21-sync-engine.js').read_text('utf-8')
assert "function consumeRealtimeEvent(event={})" in SYNC
assert "await applyEvent(event);" in SYNC
assert "version:VERSION,wake,consumeRealtimeEvent" in SYNC

sync_pos=RT.index("table:'v21_sync_events'")
message_pos=RT.index("table:'v21_messages'")
session_pos=RT.index("table:'v21_session_events'")
assert sync_pos < message_pos < session_pos

fallback=RT[message_pos:session_pos]
assert "scheduleMessageFallback(String(payload?.new?.id||''));" in fallback
assert "messages()?.apply" not in fallback
assert "setInterval" not in fallback

mark=RT[RT.index("function markInteraction()"):RT.index("function enqueue(task)")]
assert "lastInteractionAt=Date.now();" in mark
assert "schedulePresencePublish" not in mark
assert "track" not in mark
assert "navigation-change',()=>schedulePresencePublish(0,{replace:true})" in RT
assert "v21-active-contact-change',()=>schedulePresencePublish(0,{replace:true})" in RT

print("V21 direct foreground realtime + fallback + lifecycle presence contract PASS")


assert "function foregroundActive(){return authenticated()&&online()&&!document.hidden;}" in RT
assert "if(document.hidden){\n    void stop();\n    return;" in RT
assert "if(event.detail?.state==='AUTHENTICATED'&&!document.hidden)void start();" in RT
assert "queueMicrotask(()=>{if(foregroundActive())void start();else emitPresence();});" in RT

print("V21 foreground-only realtime lifecycle contract PASS")
