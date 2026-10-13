from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'app.js').read_text('utf-8')

def test_taphoa_receipt_is_cross_origin_held_for_admin_kh_draft_only():
    assert 'function bindTaphoaOrderImageIngress()' in source
    assert "const senderOrigin='https://app.taphoa.xyz';" in source
    assert "event.origin!==senderOrigin||event.source!==sender" in source
    assert "data.type!=='TAPHOA_ORDER_IMAGE_FILE'" in source
    assert "data.token!==token" in source
    assert "data.contactId||''" in source
    assert "auth.state!=='AUTHENTICATED'||auth.account?.role!=='admin'" in source
    assert "String(selected?.id||'').toLowerCase()!==contactId" in source
    assert "contacts.find(row=>String(row?.id||'').toLowerCase()===contactId&&!row.deleted_at)" in source
    assert "window.ChatAppShell?.NavigationCommand?.openContact?." in source
    assert "currentComposerScope()" in source
    assert "String(raw.type||'').toLowerCase()!=='image/png'" in source
    assert "raw.size>15*1024*1024" in source
    assert "await ingestImageFiles(" not in source[source.index('function bindTaphoaOrderImageIngress'):source.index('bindTaphoaOrderImageIngress();')]
    assert "void ingestImageFiles([file],{scope}).then(result=>" in source
    assert "const scope=currentValidScope();" in source
    assert "if(attached||processing||!readySent" in source
    assert "type:'TAPHOA_ORDER_IMAGE_ATTACHED'" in source

def test_receipt_never_auto_sends_or_uses_remote_storage():
    start=source.index('function bindTaphoaOrderImageIngress()')
    end=source.index('bindTaphoaOrderImageIngress();',start)
    bridge=source[start:end]
    for bad in ("sendMedia(", "queueMediaFiles(", "queueText(", "uploadMediaStorageObject(", "rpc(", "setInterval("):
        assert bad not in bridge,bad
    assert "composerHint.textContent='Đã đính kèm ảnh đơn · kiểm tra rồi gửi'" in bridge
    assert "clearIntentFromAddress();" in bridge
