from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text('utf-8')

source=read('index.source.html')
app=read('app.js')

assert 'V21.72.36' in source

# Scroll-down owns a real footer lane, so Composer height/reserve includes it.
assert '#threadScrollControlWrap{' in source
assert '#stageLayout[data-scroll-from-end] #threadScrollControlWrap{' in source
assert 'height:44px;' in source
assert 'margin-bottom:4px;' in source
motion=source[source.index('#threadScrollControlMotion{'):source.index('.thread-scroll-control-button{')]
assert 'top:6px;' in motion
assert 'bottom:auto;' in motion
assert '100% +' not in motion
assert '#stageLayout[data-scroll-from-end][data-stream-active] #threadScrollControlMotion{' in source

# Non-idle call state remains secondary and compact.
assert '.call-focus-slot:not([data-call-ui-state="idle"]){' in source
assert 'max-width:min(52vw,286px);' in source
assert '.call-focus-slot:not([data-call-ui-state="idle"]) .call-status-chip{' in source
assert 'max-width:148px;' in source
assert '.call-focus-slot:not([data-call-ui-state="idle"]) .call-focus-button[data-display="cancel"]{' in source
assert 'width:64px;' in source
assert 'height:40px;' in source

# Full href is preserved while long visual labels clamp to two lines.
assert '.message-link[data-link-long="true"]{' in source
assert '-webkit-line-clamp:2;' in source
assert 'line-clamp:2;' in source
assert "link.title=href;" in app
assert "if(href.length>72)link.dataset.linkLong='true';" in app
assert "link.href=href;" in app

print('V21.72.36 chat polish lock contract PASS')
