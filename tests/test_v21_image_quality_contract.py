from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
APP=(ROOT/'app.js').read_text('utf-8')

# Single-image sends retain the high-quality viewer contract.
assert "const MAX_IMAGE_EDGE=4096;" in APP
assert "const MAX_IMAGE_UPLOAD_BYTES=15*1024*1024;" in APP
assert "const IMAGE_ENCODE_QUALITY=.92;" in APP

# Multi-image sends must not silently downsample images relative to single sends.
# Native bytes are retained when supported and within the 15 MiB limit.
assert "const BATCH_IMAGE_MAX_EDGE=MAX_IMAGE_EDGE;" in APP
assert "const BATCH_IMAGE_ENCODE_QUALITY=IMAGE_ENCODE_QUALITY;" in APP

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
assert "preserveNative:true" in prepare
assert "if(Number(optimized.blob.size)>MAX_IMAGE_UPLOAD_BYTES)throw new Error('image_too_large');" in prepare
assert prepare.index("if(Number(optimized.blob.size)>MAX_IMAGE_UPLOAD_BYTES)") < prepare.index("await sha256Blob(optimized.blob)") < prepare.index("await window.V21MediaCache?.putLocal?.(")
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

print("V21 single-image and multi-image quality preservation contract PASS")
