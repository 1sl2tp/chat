from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/"app.js").read_text("utf-8")
css=(ROOT/"index.source.html").read_text("utf-8")
rules=(ROOT/"README_MAINTENANCE.md").read_text("utf-8")


def section(start,end):
    a=app.index(start)
    b=app.index(end,a+len(start))
    return app[a:b]


def test_ui150_commands_have_distinct_roles_and_near_content_priority():
    action=section("function createActionGroup(message){","let replyTarget=null;")
    assert "const canForwardInChat=Boolean(window.V21MessageForward?.canForward?.(message));" in action
    assert "if(String(message?.text||'').length){" in action
    assert "label:'Sao chép',icon:'copy'" in action
    assert "label:'Tải xuống',icon:'save'" in action
    assert "label:'Chuyển tiếp',icon:'forward'" in action
    assert "label:'Chia sẻ',icon:'share'" in action
    assert "kind==='image'||kind==='file'||kind==='audio'" in action
    assert "const order=['reply','share','forward','save','copy'];" in action
    assert "const orderedActions=isSelf?actions:[...actions].reverse();" in action
    assert "group.append(...orderedActions);" in action
    assert "window.V21MessageForward?.open?.(resolveMessage());" in action
    assert "void shareMessageText(resolveMessage());" in action
    assert "void saveMessageMedia(resolveMessage())" in action
    assert "primeMessageShareOnIntent(shareAction,resolveMessage);" in action


def test_ui150_copy_is_verifiable_and_does_not_strip_caption():
    copy=section("async function copyMessageText(message,button){","async function shareMessageText(message){")
    assert "const source=String(message?.text||'');" in copy
    assert "await navigator.clipboard.writeText(source);" in copy
    assert "copied=Boolean(document.execCommand?.('copy'));" in copy
    assert "copied?'copied':'failed'" in copy
    assert "button.setAttribute('aria-label',copied?'Đã sao chép':'Không thể sao chép');" in copy
    share=section("async function shareMessageText(message){","function messagePrimaryMediaKind(message){")
    assert "await navigator.share({text:value});" in share
    assert "typeof navigator.share!=='function'" in share
    assert "'AbortError','NotAllowedError','SecurityError'" in share


def test_ui150_media_filename_scope_and_share_gesture():
    assert "function isTransferableMessageMedia(item){" in app
    assert "item.type==='file'||item.type==='image'||item.kind==='image'||item.kind==='audio'" in app
    assert "filter(isTransferableMessageMedia)" in app
    media=section("function mediaDownloadName(media,index=0){","async function saveMediaDescriptor(media,index=0){")
    assert "media?.type==='file'||media?.kind==='audio'" in media
    assert "'Ghi-am':'Tep'" in media
    assert "extensionForMime(media?.mimeType||'')" in media
    for ext in ("audio/mp4","audio/mpeg","audio/ogg","audio/webm","audio/wav"):
        assert ext in app
    assert "const type=String(item?.mimeType||blob.type||'application/octet-stream');" in app
    transfer=section("async function shareMessageMedia(message,button=null){","async function openFileMedia(media){")
    assert "const files=preparedShareFilesForMessage(message);" in transfer
    assert transfer.index("const files=preparedShareFilesForMessage(message);")<transfer.index("await navigator.share(")
    assert "await mediaBlobForDescriptor(" not in transfer
    assert "button.dataset.state='preparing';" in transfer
    assert "ready?'Chạm lại để chia sẻ':'Không thể chuẩn bị tệp'" in transfer
    assert "if(button?.dataset.state==='preparing')return false;" in transfer
    assert "const caption=String(message?.text||'').trim();" in transfer
    assert "...(caption?{text:caption}:{})" in transfer
    assert "mediaBlobForDescriptor(media)" in app
    assert "accountId!==String(currentMediaAccountId()||'')" in app


def test_ui150_touch_action_toolbar_stays_in_bounds_and_has_44px_targets():
    start=css.index("/* UI-150 touch action toolbar")
    end=css.index("/* Equivalent purpose",start)
    touch=css[start:end]
    assert "@media (max-width:700px),(hover:none),(pointer:coarse)" in touch
    assert "width:max-content;" in touch
    assert "max-width:calc(100vw - max(12px,env(safe-area-inset-left,0px)) - max(12px,env(safe-area-inset-right,0px)))" in touch
    assert "height:var(--ui-control-touch,44px);" in touch
    assert "gap:var(--ui-space-4,4px);" in touch
    assert ".message-action-group.user-actions" in touch
    assert ".message-action-group.assistant-actions" in touch
    assert '.message-turn[data-actions-placement="below"]' in touch
    assert "width:var(--ui-control-touch,44px);" in touch
    assert "height:var(--ui-control-touch,44px);" in touch
    action=section("function toggleActionsForTurn(turn,force){","function bindTurnActionTap(turn,target){")
    assert "const above=top-Math.max(0,headerBottom);" in action
    assert "const below=composerTop-unit.getBoundingClientRect().bottom;" in action
    assert "turn.dataset.actionsPlacement=(above<54&&below>=54)?'below':'above';" in action
    assert "closeAllTurnActions(turn);" in action


def test_ui150_image_viewer_shares_current_asset_only():
    assert "saveText.textContent='Tải ảnh';" in app
    assert "return saveMediaDescriptor(media,Math.max(0,imageViewerIndex));" in app
    assert "return shareMessageMedia({media});" in app
    assert "min-height:var(--ui-control-touch,44px);" in css
    assert ".image-review-more{" in css
    assert "## 3i. UI-150" in rules
