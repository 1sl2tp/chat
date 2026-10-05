from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/"app.js").read_text("utf-8")


def section(start,end):
    a=app.index(start)
    b=app.index(end,a)
    return app[a:b]


def test_native_share_keeps_transient_user_activation():
    share=section("async function shareMessageMedia(message){","async function openFileMedia")
    assert "const files=preparedShareFilesForMessage(message);" in share
    assert "await mediaBlobForDescriptor" not in share
    assert share.index("preparedShareFilesForMessage") < share.index("navigator.share")
    assert "NotAllowedError" in share
    assert "SecurityError" in share
    assert "AbortError" in share
    assert "throw error" not in share


def test_visible_or_local_media_primes_share_blob_before_click():
    hydrate=section("async function hydrateImageElement","function imageAspectRatio")
    assert "cacheMediaShareBlob({...media,accountId,assetId},row.blob);" in hydrate

    image_upload=section("async function prepareImageAttachment","function sameDraftImageContentExists")
    assert "cacheMediaShareBlob(item,optimized.blob);" in image_upload

    file_upload=section("async function prepareFileAttachment","async function ingestFileAttachments")
    assert "cacheMediaShareBlob(item,file);" in file_upload


def test_share_controls_warm_cache_on_user_intent():
    assert "primeMessageShareOnIntent(shareAction,resolveMessage);" in app
    assert "primeMessageShareOnIntent(shareItem,()=>({media:currentImageViewerDescriptor()}));" in app
    prime=section("function primeMessageShareOnIntent","async function mediaBlobForDescriptor")
    assert "pointerenter" in prime
    assert "focus" in prime
    assert "touchstart" in prime


def test_share_cache_is_account_scoped_and_cleared():
    assert "const mediaShareBlobs=new Map();" in app
    assert app.count("mediaShareBlobs.clear();") >= 2
    assert "mediaShareBlobs.delete(`" + "${ownerAccountId}::${assetId}" + "`);" in app
