from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text('utf-8')


source = read('index.source.html')
summary_css = read('work-customer-summary.css')
shell = read('shell.js')

# Default, active-contact and Work use the same 260px mode switch with 2 equal tabs.
assert 'width:min(100%,260px);' in source
assert 'grid-template-columns:minmax(0,1fr) minmax(0,1fr);' in source
active = source.split('.top-mode-switch[data-contact-identity="true"]{', 1)[1].split('}', 1)[0]
assert 'grid-template-columns:repeat(2,minmax(0,1fr));' in active
assert 'max-content' not in active

# The late inlined Work stylesheet must not undo the equal-width source contract.
owner = summary_css.split('#appShell .top-mode-switch[data-contact-identity="true"]{', 1)[1].split('}', 1)[0]
assert 'width:min(100%,260px);' in owner
assert 'grid-template-columns:repeat(2,minmax(0,1fr));' in owner
assert 'width:max-content' not in owner
chat = summary_css.split('.top-mode-tab[data-top-tab="chat"]{', 1)[1].split('}', 1)[0]
assert 'width:100%;' in chat
assert 'min-width:0;' in chat

# Runtime still changes only identity content/state, without changing switch dimensions.
assert 'switcher.dataset.contactIdentity=String(visible);' in shell
assert '.top-mode-contact-avatar{position:relative;width:26px;height:26px;' in source
assert '.top-mode-tab[data-top-tab="chat"][data-contact-identity="true"]{' in source
assert '.top-mode-tab[data-top-tab="chat"] [data-chat-tab-label]{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' in source

print('V21.72.46 equal-width contact/work header contract PASS')
