from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
AUTH=(ROOT/'auth-session-store.js').read_text('utf-8')
SYNC=(ROOT/'v21-sync-engine.js').read_text('utf-8')

m=re.search(r"const HEARTBEAT_MS=(\d+);",AUTH)
assert m and int(m.group(1)) >= 60000
assert "document.visibilityState==='hidden'" in AUTH
assert "document.visibilityState==='visible')void heartbeat()" in AUTH
assert "heartbeat({force:true})" in AUTH

assert "const UNREAD_COOLDOWN_MS=750;" in SYNC
assert "if(unreadRefreshPromise)" in SYNC
assert "scheduleUnreadRefresh(UNREAD_COOLDOWN_MS);" in SYNC
assert "refreshUnread({force:true})" in SYNC

do_sync=SYNC[SYNC.index("async function doSync(reason)"):SYNC.index("function shortSyncFenceDelay")]
assert "const sent=await flushOutbox();" in do_sync
assert "if(sent>0)await pullAll();" in do_sync
assert "await flushOutbox();\n  await pullAll();" not in do_sync

print("V21 resource guardrails runtime contract PASS")


PUSH=(ROOT/'admin-push-controller.js').read_text('utf-8')
SOURCE=(ROOT/'index.source.html').read_text('utf-8')
assert "persistSession:true" in AUTH
assert "autoRefreshToken:true" in AUTH
assert 'autocomplete="username"' in SOURCE
assert 'autocomplete="current-password"' in SOURCE
assert "function mobileAdminBackground()" in PUSH
assert "current==='ios-pwa'||current==='android-pwa'||current==='android-web'" in PUSH

print("V21 persistent session + admin mobile background contract PASS")


RT=(ROOT/'v21-realtime-session.js').read_text('utf-8')
assert "function foregroundActive(){return authenticated()&&online()&&!document.hidden;}" in RT
assert "if(document.hidden){\n    void stop();\n    return;" in RT
assert "pendingMessageFallbackIds=new Set()" in RT

print("V21 foreground-only realtime + targeted fallback contract PASS")
