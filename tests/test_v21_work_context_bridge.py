from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = ROOT / 'getlink-auth-bridge.js'
SHELL = (ROOT / 'shell.js').read_text(encoding='utf-8')
SOURCE = (ROOT / 'index.source.html').read_text(encoding='utf-8')

# CHAT keeps its own work route, but must not authenticate or message GETLINK.
assert "const ROUTES=Object.freeze(['chat','work']);" in SHELL
assert "openWork(){return this.open('work')}" in SHELL
assert 'id="workThreadView"' in SOURCE
assert 'data-work-owner="chat"' in SOURCE

assert not BRIDGE.exists(), 'GETLINK auth bridge must be removed from CHAT'
for forbidden in [
    'V21GetlinkAuthBridge',
    'GETLINK_ORIGIN',
    'taphoa-chat-auth',
    'taphoa-getlink-auth-request',
    'workGetlinkFrame',
    'https://get.taphoa.xyz/?embed=1',
]:
    assert forbidden not in SHELL, forbidden
    assert forbidden not in SOURCE, forbidden

print('CHAT-owned work surface has no GETLINK bridge PASS')
