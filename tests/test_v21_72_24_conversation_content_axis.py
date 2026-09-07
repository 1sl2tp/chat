from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text('utf-8')

source=read('index.source.html')
app=read('app.js')

assert 'V21.72.35' in source
assert '--conversation-content-max-width:48rem' in source
assert 'id="conversationContentAxis"' in source
assert 'data-conversation-content-owner="true"' in source

owner_start=source.index('<div id="conversationContentAxis"')
owner_end=source.index('<div id="workThreadView"',owner_start)
owner=source[owner_start:owner_end]
for token in ['id="historyStatus"','id="topSpacer"','id="messageWindow"','id="bottomSpacer"']:
    assert token in owner, token

assert '#conversationContentAxis{' in source
assert 'max-width:var(--conversation-content-max-width)' in source
assert 'padding-inline:var(--conversation-content-gutter)' in source
assert '.message-turn-shell{' in source
assert '#messageWindow>.message-row+.message-row{' in source
assert '#messageWindow>.message-row[data-turn="user"]+.message-row[data-turn="assistant"]' in source
assert '#messageWindow>.message-row[data-turn="assistant"]+.message-row[data-turn="user"]' in source
assert '--conversation-content-gutter:24px' in source
assert '.message-body{' in source
assert 'line-height:1.5rem' in source
assert '.assistant-message-unit>.message-text' in source
assert 'node.dataset.hasMedia=message.media' in app
assert "turn.dataset.hasMedia=message.media" in app
assert 'function messageContentKind(message)' in app
assert "node.dataset.contentKind=messageContentKind(message)" in app
assert "turn.dataset.contentKind=messageContentKind(message)" in app
assert 'data-content-kind="audio"' in source
assert 'data-content-kind="image"' in source
assert 'data-content-kind="gallery"' in source
assert 'margin-top:15px' in source
assert 'width:min(16.5rem,100%)' in source
assert 'width:min(16rem,100%)' in source
assert '.message-unit>.message-text:not([hidden]) + [data-message-media-root="true"]' in source
assert 'cgpt-source-assistant-visual min-h-8 py-1' not in app

assert app.count("outer.className='message-turn-shell';")==2
assert "'chat-content-axis pt-3'" not in app
assert "'assistant-turn-shell chat-content-axis'" not in app

print('V21.72.35 conversation content axis contract PASS')
