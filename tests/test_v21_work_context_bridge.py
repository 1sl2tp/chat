from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BRIDGE=(ROOT/'getlink-auth-bridge.js').read_text(encoding='utf-8')
compact=''.join(BRIDGE.split())

assert "const GETLINK_ORIGIN='https://get.taphoa.xyz'" in BRIDGE
assert "event.origin!==GETLINK_ORIGIN" in compact
assert "target.contentWindow.postMessage({type:'taphoa-chat-auth'" in compact
assert "taphoa-getlink-auth-request" in BRIDGE

# Chat order-source is independent from GETLINK. The iframe bridge only carries auth.
for forbidden in [
    'v21-work-context','taphoa-chat-work-context','taphoa-work-order-created',
    'sourceMessageIds','markImported','latestWorkContext','postWorkContext',
]:
    assert forbidden not in BRIDGE, forbidden

print('GETLINK auth-only bridge PASS')
