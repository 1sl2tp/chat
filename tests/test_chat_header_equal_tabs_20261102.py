"""Header chat: user/avatar and Photos share the wider intrinsic tab width.

CSS-only contract: 1fr max-content sizing gives both tracks equal intrinsic
width without JS measurement; available space and call controls cap the pair.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
work = (ROOT / "work-customer-summary.css").read_text("utf-8")
mobile = (ROOT / "mobile-ui-polish.css").read_text("utf-8")
source = (ROOT / "index.source.html").read_text("utf-8")
shell = (ROOT / "shell.js").read_text("utf-8")

def block(css, marker):
    start = css.index(marker)
    return css[start:css.index("}", start) + 1]

desktop = block(work, '#appShell .top-mode-switch[data-contact-identity="true"]{')
narrow = block(mobile, '#appShell[data-auth-state="authenticated"] .top-mode-switch[data-contact-identity="true"]{')
user = block(work, '#appShell .top-mode-switch[data-contact-identity="true"] .top-mode-tab[data-top-tab="chat"]{')
photos = block(work, '#appShell .top-mode-switch[data-contact-identity="true"] .top-mode-tab[data-top-tab="photos"]{')

for css in (desktop, narrow):
    assert "width:max-content;" in css
    assert "grid-template-columns:repeat(2,minmax(0,1fr));" in css
    assert "grid-template-columns:max-content max-content;" not in css
    assert "grid-template-columns:minmax(0,1fr) 52px;" not in css
    assert "max-width:min(100%," in css

assert "max-width:min(100%,260px);" in desktop
assert "max-width:min(100%,280px);" in narrow
assert all(x in user for x in ("width:100%;", "max-width:none;", "min-width:0;"))
assert "width:100%;" in photos and "min-width:0;" in photos
assert ".top-mode-tab[data-top-tab=\"chat\"] [data-chat-tab-label]{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" in source
assert 'data-top-tab="chat"' in source and 'data-top-tab="photos"' in source
assert "const visible=Boolean(" in shell and "switcher.dataset.contactIdentity=String(visible)" in shell
assert 'data-call-focus-slot' in source and 'grid-template-columns:44px minmax(0,1fr) auto;' in mobile

# The layout is CSS intrinsic sizing; no new ResizeObserver or measuring
# loops are added to the live chat header.
assert "CHAT-HEADER-EQUAL-TABS-20261102" in work
assert "balanceChatHeaderTabs" not in shell
print("CHAT header equal intrinsic User/Photos tab widths PASS")
