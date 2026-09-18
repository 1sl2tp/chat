from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/'app.js').read_text('utf-8')
controller=(ROOT/'interaction-controller.js').read_text('utf-8')
sync=(ROOT/'v21-sync-engine.js').read_text('utf-8')

assert "MESSAGE_FORWARD:'MESSAGE_FORWARD'" in controller
assert "label:'Chuyển tiếp'" in app
assert "openMessageForward(resolveMessage())" in app
assert "window.V21MessageForward=Object.freeze" in app
assert "window.V21ContactStore?.snapshot?.()" in app
assert "target===String(currentContactId||'')" in sync
assert "async function forwardMessage(" in sync
assert ".storage.from('v21-media').copy(sourceKey,storageKey)" in sync
assert "rpc('v21_media_assets_send'" in sync
assert "rpc('v21_message_send'" in sync
assert "messages()?.mergeForContact?.(messageRow" in sync
assert "forwardMessage,flushOutbox" in sync
print('chat message forward contract PASS')
