from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
css=(ROOT/'mobile-chat-refresh.css').read_text('utf-8')
base=(ROOT/'index.source.html').read_text('utf-8')
app=(ROOT/'app.js').read_text('utf-8')

def test_single_pane_received_message_edge_and_medium_breakpoints():
    # One-screen layout ends where the persistent desktop directory begins.
    assert '@media (max-width:63.999rem)' in css
    start=css.index('/* UI-139/141')
    single=css[start:]
    assert 'max-width:none!important;' in single
    assert 'margin-inline:0!important;' in single
    assert 'padding-inline:0!important;' in single
    assert 'padding-inline:var(--ui-chat-message-gutter,var(--ui-gutter-mobile,12px))!important;' in single
    # All incoming payload variants share the same remote turn container.
    assert '#messageWindow>.message-row[data-turn="assistant"] .assistant-message{' in single
    assert 'justify-content:flex-start!important;' in single
    assert '#messageWindow>.message-row[data-turn="assistant"] .assistant-message-unit{' in single
    assert 'margin-inline-start:0!important;' in single
    assert 'margin-inline-end:auto!important;' in single
    # 48rem centering remains available for wide-desktop, not single-pane.
    assert 'max-width:var(--conversation-content-max-width)' in base
    assert '@media (min-width:64rem)' in base

def test_source_incoming_vs_self_keeps_owner_and_direction():
    assert "turn.dataset.turn=" in app
    assert "message.sender==='self'\n      ?'user'\n      :'assistant';" in app
    assert "message.sender==='self'\n      ?'flex w-full justify-end'\n      :'assistant-message flex w-full justify-start';" in app
    assert "message.sender==='self'\n      ?'message-unit user-message-unit'\n      :'message-unit assistant-message-unit';" in app
    # The new CSS touches assistant messages only, not Admin/self.
    scoped=css[css.index('/* UI-139/141'):]
    assert '[data-turn="user"]' not in scoped
    assert '#scrollRoot' not in scoped
    assert 'transform:' not in scoped
    assert 'fetch(' not in scoped and '.rpc(' not in scoped and 'setInterval(' not in scoped

def test_image_and_other_media_are_not_resized_or_rewritten():
    assert '.assistant-message-unit>.message-media-shell{margin-right:auto}' in base
    assert 'object-fit:contain!important' in base
    assert 'object-fit:cover!important' in base
    assert 'function patchMessageMediaShell' in app
    assert 'function reconcileMessageWindow' in app
