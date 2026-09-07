from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text('utf-8')

source=read('index.source.html')
app=read('app.js')

assert 'V21.72.30' in source
assert '.reply-quote{' in source
assert '.reply-context{' in source
assert '--reply-rail:#78aef8' in source
assert 'border-inline-start:2px solid var(--reply-rail)' in source
assert 'border-radius:0' in source
assert 'background:color-mix(in srgb,#78aef8 5%,var(--theme-surface-secondary))' in source
assert 'reply-quote-label' not in source

assert "replyContextLabel.textContent='Đang trả lời';" in app
assert "Đang trả lời tin của bạn" not in app
assert "Đang trả lời B" not in app
assert "label.textContent=replyTo.sender==='self'?'Bạn':'B'" not in app
assert "quote.append(text)" in app
assert "quote.append(label,text)" not in app

print('V21.72.30 reply visual cleanup contract PASS')
