"""UI-207: No stale demo controls in the production Chat UI.

B+ previously fabricated a remote message on click despite being sr-only in
source; hidden CSS alone is not sufficient to retire a production test hook.
"""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/"index.source.html").read_text("utf-8")
APP=(ROOT/"app.js").read_text("utf-8")
BUILT=(ROOT/"index.html").read_text("utf-8")

def test_demo_control_removed_from_source_and_built_output():
    for markup in (HTML,BUILT):
        assert 'id="remote"' not in markup
        assert '>B+</button>' not in markup
        assert 'id="remoteTypingCenter"' not in markup
        assert "remote-typing-center" not in markup
    # Bundled reference styling may still mention stream state, but the
    # obsolete B+ control and its activation code must not exist.
    assert "data-stream-active" not in HTML

def test_fake_remote_message_pipeline_is_removed():
    for token in (
        'scheduleRemoteMessageFromDemo','appendRemote()',
        'Demo B+:','B gửi tin mới',
        "document.getElementById('remote')",
        "remote.addEventListener",
        'setRemoteTyping(',
    ):
        assert token not in APP,token

def test_real_conversation_and_customer_actions_are_preserved():
    assert "window.V21ConversationBridge={" in APP
    assert "append(row,{selfId,remote}={})" in APP
    assert "reconcile(rows,{selfId}={})" in APP
    assert 'id="editor"' in HTML
    assert 'id="chatCallFocus"' in HTML
    assert 'id="chatQuickActions"' in HTML
    assert 'id="modeLabel"' in HTML
