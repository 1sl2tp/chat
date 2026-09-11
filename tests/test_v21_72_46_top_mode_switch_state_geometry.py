from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text('utf-8')


source = read('index.source.html')
shell = read('shell.js')

# Stable outer switch: default/no-contact/work stays balanced at 1/2–1/2.
assert 'width:min(100%,260px);' in source
assert 'grid-template-columns:minmax(0,1fr) minmax(0,1fr);' in source

# Only the active chat-contact identity expands the chat side to 2/3.
assert '.top-mode-switch[data-contact-identity="true"]{' in source
assert 'grid-template-columns:minmax(0,2fr) minmax(0,1fr);' in source

# Runtime owns that state: it is true only while chat identity is actually visible,
# and returns to false when switching to Công việc or when no contact is selected.
assert 'switcher.dataset.contactIdentity=String(visible);' in shell

# Avatar remains inside the existing tab geometry and moves closer to the inner left edge.
assert '.top-mode-contact-avatar{width:20px;height:20px;' in source
assert '.top-mode-tab{\n  min-width:0;\n  min-height:38px;' in source
assert '.top-mode-tab[data-top-tab="chat"][data-contact-identity="true"]{' in source
assert 'padding-left:4px;' in source
assert 'justify-content:flex-start;' in source

print('V21.72.46 top mode switch state geometry contract PASS')
