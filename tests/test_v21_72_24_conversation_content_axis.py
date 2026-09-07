from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text('utf-8')

source=read('index.source.html')
app=read('app.js')

assert 'V21.72.24' in source
assert '--conversation-content-max-width:44rem' in source
assert 'id="conversationContentAxis"' in source
assert 'data-conversation-content-owner="true"' in source

owner_start=source.index('<div id="conversationContentAxis"')
owner_end=source.index('<div id="workThreadView"',owner_start)
owner=source[owner_start:owner_end]
for token in ['id="historyStatus"','id="topSpacer"','id="messageWindow"','id="bottomSpacer"']:
    assert token in owner, token

assert '#conversationContentAxis{' in source
assert 'max-width:var(--conversation-content-max-width)' in source
assert 'padding-inline:var(--chat-content-gutter)' in source
assert '.message-turn-shell{' in source
assert '#messageWindow>.message-row+.message-row{' in source
assert '#messageWindow>.message-row[data-turn="user"]+.message-row[data-turn="assistant"]' in source
assert '#messageWindow>.message-row[data-turn="assistant"]+.message-row[data-turn="user"]' in source

assert app.count("outer.className='message-turn-shell';")==2
assert "'chat-content-axis pt-3'" not in app
assert "'assistant-turn-shell chat-content-axis'" not in app

print('V21.72.24 conversation content axis contract PASS')
