from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
app = (ROOT / "app.js").read_text("utf-8")
forward = (ROOT / "message-forward.js").read_text("utf-8")
directory = (ROOT / "contact-directory-admin.js").read_text("utf-8")
admin = (ROOT / "admin-composer-actions.js").read_text("utf-8")


def test_share_opens_chat_recipient_picker_before_any_native_file_hydration():
    assert "const canForwardInChat=Boolean(window.V21MessageForward?.canForward?.(message));" in app
    assert "label:'Chuyển tiếp',icon:'forward'" in app
    assert "window.V21MessageForward?.open?.(resolveMessage());" in app
    assert "label:'Chia sẻ',icon:'share'" in app
    assert "label:'Tải xuống',icon:'save'" in app
    assert "const canForwardInChat=Boolean(window.V21MessageForward?.canForward?.(message));" in app
    assert "Chia sẻ trong Chat" in forward
    assert "Tìm người nhận" in forward
    assert "await window.V21SyncEngine?.forwardMessage?.({" in forward
    assert "window.setTimeout(()=>close({restoreFocus:false}),220);" in forward


def test_viewer_forwards_only_when_selected_media_is_the_sole_source_asset():
    assert "const source=sourceId?store.items.find(" in app
    assert "if(source&&assets.length===1" in app
    assert "String(assets[0]?.assetId||'')===String(media.assetId)" in app
    assert "closeImageViewer();" in app
    assert "return shareMessageMedia({media});" in app


def test_customer_business_actions_are_hidden_and_guarded_for_other_groups():
    assert "function groupForContact(contactId)" in directory
    assert "if(!admin?.id||String(loadedAdminId)!==String(admin.id))return null;" in directory
    assert "groupForContact,refreshGroups:" in directory
    assert "document.dispatchEvent(new CustomEvent('v21-contact-groups-change'));" in directory
    assert "const customer=admin&&contact&&activeContactGroup()==='customer';" in admin
    assert "if(label)label.hidden=!customer;" in admin
    assert "if(section)section.hidden=!customer;" in admin
    assert "button.disabled=!customer" in admin
    assert "if(!contactId||activeContactGroup()!=='customer')return false;" in admin
    assert "document.addEventListener('v21-contact-groups-change',syncVisibility);" in admin
    for action in ("quote", "debt", "stock-check", "credentials"):
        assert "action:'" + action + "'" in admin
