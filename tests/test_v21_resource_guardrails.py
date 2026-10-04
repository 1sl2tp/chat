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
