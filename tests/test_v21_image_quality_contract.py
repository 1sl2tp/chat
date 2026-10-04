from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
APP=(ROOT/'app.js').read_text('utf-8')

assert "const MAX_IMAGE_EDGE=4096;" in APP
assert "const MAX_IMAGE_UPLOAD_BYTES=15*1024*1024;" in APP
assert "const IMAGE_ENCODE_QUALITY=.92;" in APP

start=APP.index("async function optimizeImageBlob(file){")
end=APP.index("async function sha256Blob(blob){",start)
optimize=APP[start:end]

# Full-screen viewer must not be fed a 1600px / quality-.78 recompress merely
# because a normal JPEG/PNG/WebP is larger than 512 KB. Preserve browser-native
# source bytes while they already fit the existing 15 MiB media limit.
assert "const browserNative=['image/jpeg','image/jpg','image/png','image/webp'].includes(mime);" in optimize
assert "scale===1&&browserNative&&Number(file.size)<=MAX_IMAGE_UPLOAD_BYTES" in optimize
assert "512*1024" not in optimize
assert "context.drawImage(source,0,0,targetWidth,targetHeight);" in optimize

print("V21 image full-resolution viewer quality contract PASS")
