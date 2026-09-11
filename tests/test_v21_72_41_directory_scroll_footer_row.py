from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

source=read("index.source.html")
directory=read("contact-directory-admin.js")
zalo=read("zalo-admin-link.js")

# Keep the existing release checkpoint; this remains a bounded directory-only UI change.
assert "V21.72.39" in source

# The body is a layout owner, not the scroll owner. Search/filter stay fixed above the nav.
assert ".wm-sidebar-body{flex:1 1 auto;min-height:0;overflow:hidden;display:flex;flex-direction:column}" in source
assert ".wm-sidebar-navigation{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}" in source
assert ".contact-directory-tools{position:static;" in directory

# Directory sync preserves the actual list scroll position, not the whole sidebar body.
assert "const scrollHost=host.closest('.wm-sidebar-navigation');" in directory

# Footer actions collapse to one compact horizontal row and keep touch targets usable.
assert ".shell-sidebar-account-footer{grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:6px;padding:6px 0 max(6px,env(safe-area-inset-bottom))}" in source
assert ".shell-sidebar-account-footer .shell-sidebar-account-main,.shell-sidebar-account-footer .shell-sidebar-account-action,.shell-sidebar-account-footer .zalo-account-admin-open{width:100%;min-width:0;height:40px;min-height:40px;" in source
assert ".shell-sidebar-account-footer .shell-sidebar-account-avatar,.shell-sidebar-account-footer .shell-sidebar-account-copy span,.shell-sidebar-account-footer .shell-sidebar-account-chevron{display:none}" in source

# The long admin label is compact in the footer while accessibility keeps the full destination name.
assert "button.textContent='Zalo';" in zalo
assert "button.setAttribute('aria-label','Zalo & tài khoản');" in zalo

print("V21.72.41 directory fixed tools/footer row contract PASS")
