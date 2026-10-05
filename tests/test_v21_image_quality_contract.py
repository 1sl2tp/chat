from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
APP=(ROOT/'app.js').read_text('utf-8')

# Single-image sends retain the high-quality viewer contract.
assert "const MAX_IMAGE_EDGE=4096;" in APP
assert "const MAX_IMAGE_UPLOAD_BYTES=15*1024*1024;" in APP
assert "const IMAGE_ENCODE_QUALITY=.92;" in APP

# Multi-image sends use a lighter chat profile so batches do not upload/download
# tens of megabytes before the receiver can render the gallery.
assert "const BATCH_IMAGE_MAX_EDGE=2048;" in APP
assert "const BATCH_IMAGE_ENCODE_QUALITY=.86;" in APP

start=APP.index("async function optimizeImageBlob(file,{")
end=APP.index("async function sha256Blob(blob){",start)
optimize=APP[start:end]

assert "maxEdge=MAX_IMAGE_EDGE" in optimize
assert "quality=IMAGE_ENCODE_QUALITY" in optimize
assert "preserveNative=true" in optimize
assert "if(preserveNative&&scale===1&&browserNative&&Number(file.size)<=MAX_IMAGE_UPLOAD_BYTES)" in optimize
assert "canvas.toBlob(resolve,outputType,safeQuality)" in optimize
assert "512*1024" not in optimize
assert "context.drawImage(source,0,0,targetWidth,targetHeight);" in optimize

prepare_start=APP.index("async function prepareImageAttachment(file,scope,{batch=false}={})")
prepare_end=APP.index("function sameDraftImageContentExists",prepare_start)
prepare=APP[prepare_start:prepare_end]
assert "maxEdge:BATCH_IMAGE_MAX_EDGE" in prepare
assert "quality:BATCH_IMAGE_ENCODE_QUALITY" in prepare
assert "preserveNative:false" in prepare
assert "localImagePreviewUrls.set(String(assetId),previewUrl);" in prepare
assert "void warmLocalImagePreview(previewUrl);" in prepare
assert "await warmLocalImagePreview(previewUrl);" not in prepare

canonical_start=APP.index("async function canonicalizeImageIngressFile")
canonical_end=APP.index("async function prepareImageAttachment",canonical_start)
canonical=APP[canonical_start:canonical_end]
assert "return file;" in canonical
assert "return new File([file],name" in canonical
assert "const bytes=await file.arrayBuffer();" not in canonical

ingest_start=APP.index("async function ingestImageFiles")
ingest_end=APP.index("async function addImagesFromInput",ingest_start)
ingest=APP[ingest_start:ingest_end]
assert "const batch=rawFiles.length>1;" in ingest
assert "prepareImageAttachment(file,scope,{batch})" in ingest

print("V21 single-image quality + multi-image performance contract PASS")
