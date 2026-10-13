from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'mobile-chat-refresh.css').read_text('utf-8')
inbound=(ROOT/'bridge/zalo/src/incoming-message.mjs').read_text('utf-8')
server=(ROOT/'bridge/zalo/src/server.mjs').read_text('utf-8')

def test_narrow_chat_gutter_aligns_content_to_composer_no_responsive_duplication():
    assert '@media (max-width:639px)' in source
    assert '#appShell[data-auth-state="authenticated"][data-route="chat"] #conversationContentAxis{' in source
    assert 'margin-inline:0;' in source
    assert 'padding-inline:0;' in source
    assert 'padding-inline:var(--ui-chat-message-gutter,var(--ui-gutter-mobile,12px));' in source
    assert '#scrollRoot' not in source[source.index('/* UI-139 narrow conversation axis'):], 'do not create a second scroll owner'

def test_zalo_cards_use_existing_text_ingress_only():
    assert "function normalizeContactCard(content" in inbound
    assert "else if(msgType==='chat.recommended')normalized=normalizeMissedCall(content)||normalizeContactCard(content)" in inbound
    for value in ('share.contact','chat.contact','chat.card','share.profile','share.user'):
        assert value in inbound
    assert "if(!name||(!phone&&!uid&&!safeLink))return null" in inbound
    assert "📇 Danh thiếp Zalo" in inbound
    assert "bridged=await messageGateway.ingestText(event)" in server
    assert "const target=await messageGateway.mediaTarget(event)" in server
