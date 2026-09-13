from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BRIDGE=(ROOT/'getlink-auth-bridge.js').read_text(encoding='utf-8')
compact=''.join(BRIDGE.split())

assert "const GETLINK_ORIGIN='https://get.taphoa.xyz'" in BRIDGE
assert "event.origin!==GETLINK_ORIGIN" in compact
assert "v21-work-context" in BRIDGE
assert "taphoa-chat-work-context" in BRIDGE
assert "taphoa-work-order-created" in BRIDGE
assert "sourceMessageIds" in BRIDGE
assert "markImported" in BRIDGE
assert "latestWorkContext" in BRIDGE
assert "target.contentWindow.postMessage({type:'taphoa-chat-auth'" in compact
assert "target.contentWindow.postMessage({type:'taphoa-chat-work-context'" in compact

print('work context bridge PASS')
