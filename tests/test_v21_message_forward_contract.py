from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/'app.js').read_text('utf-8')
module=(ROOT/'message-forward.js').read_text('utf-8')
source=(ROOT/'index.source.html').read_text('utf-8')
controller=(ROOT/'interaction-controller.js').read_text('utf-8')
sync=(ROOT/'v21-sync-engine.js').read_text('utf-8')

assert "MESSAGE_FORWARD:'MESSAGE_FORWARD'" in controller
assert 'data-build-source="message-forward.js"' in source
assert "label:'Chuyển tiếp'" in app
assert "window.V21MessageForward?.canForward?.(message)" in app
assert "window.V21MessageForward?.open?.(resolveMessage())" in app
assert "const MESSAGE_FORWARD_OWNER" not in app
assert "window.V21MessageForward=Object.freeze" not in app

assert "window.V21MessageForward=Object.freeze" in module
assert "window.V21ContactStore?.snapshot?.()" in module
assert "window.V21SyncEngine?.forwardMessage?.(" in module
assert "window.V21InteractionController?.enter?.(" in module
assert "window.V21Icons?.markup?.('close',{size:20})" in module

assert "target===String(currentContactId||'')" in sync
assert "async function forwardMessage(" in sync
assert ".storage.from('v21-media').copy(sourceKey,storageKey)" in sync
assert "rpc('v21_media_assets_send'" in sync
assert "rpc('v21_message_send'" in sync
assert "messages()?.mergeForContact?.(messageRow" in sync
assert "forwardMessage,flushOutbox" in sync
print('chat message forward module contract PASS')
