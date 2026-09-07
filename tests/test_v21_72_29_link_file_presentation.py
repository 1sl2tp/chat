from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text('utf-8')

source=read('index.source.html')
app=read('app.js')

assert 'V21.72.32' in source

assert 'const MESSAGE_LINK_RE=' in app
assert 'function appendMessageTextWithLinks(container,value)' in app
assert 'function renderMessageBody(container,value)' in app
assert "link.className='message-link'" in app
assert "link.target='_blank'" in app
assert "link.rel='noopener noreferrer'" in app
assert 'renderMessageBody(messageBody,message.text);' in app
assert app.count('renderMessageBody(messageBody,message.text);') == 2

assert '.message-body[data-has-link="true"]{' in source
assert '.message-link{' in source
assert 'color:#4f86d9' in source
assert 'overflow-wrap:anywhere' in source
assert '.message-link:hover{text-decoration:underline}' in source

file_start=source.index('.file-message-card{')
file_end=source.index('.attachment-image-chip{',file_start)
file_css=source[file_start:file_end]
assert 'width:min(18rem,100%)' in file_css
assert 'width:min(17rem,100%)' in file_css
assert '72vw' not in file_css
assert '78vw' not in file_css
assert 'border-radius:12px' in file_css
assert 'text-overflow:ellipsis' in file_css

# Link preview is intentionally out of scope for this release: URLs are lightweight anchors only.
assert 'link-preview-card' not in source
assert 'createLinkPreview' not in app
assert 'fetchLinkPreview' not in app

print('V21.72.32 link/file presentation contract PASS')
