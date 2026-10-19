from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SYNC=(ROOT/'v21-sync-engine.js').read_text('utf-8')

assert "function isEmptyStorageUploadError(error){" in SYNC
assert "message.includes('no content provided')" in SYNC
assert "function preferBinaryStorageUploadBody(){" in SYNC
assert "/iPhone|iPad|iPod/i.test(ua)" in SYNC
assert "function rematerializeStorageUploadBody" in SYNC
assert "return buffer;" in SYNC
assert "return new Uint8Array(buffer);" not in SYNC
assert "async function uploadMediaStorageObject" in SYNC
assert "if(error&&isEmptyStorageUploadError(error)){" in SYNC
assert "const retryBody=await rematerializeStorageUploadBody(body,asset);" in SYNC
assert "if(isEmptyStorageUploadError(error))return true;" in SYNC
assert "const uploadError=await uploadMediaStorageObject(requestClient,asset,uploadBody);" in SYNC

# Direct media upload must go through the recovery owner. Keep only the helper's
# upload calls, not a second bypass inside flushMediaItem.
flush_start=SYNC.index("async function flushMediaItem")
flush_end=SYNC.index("async function flushOutbox",flush_start)
flush=SYNC[flush_start:flush_end]
assert ".storage.from('v21-media').upload(" not in flush
assert "uploadMediaStorageObject(requestClient,asset,uploadBody)" in flush

print("V21 iOS zero-byte Storage upload recovery contract PASS")
