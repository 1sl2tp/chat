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

# The sidebar is the three-region owner. Body owns the flexible middle lane,
# navigation alone owns list scrolling, and search/filter stay fixed above it.
assert '.wm-sidebar-sidebar{\n  box-sizing:border-box;\n  display:grid;\n  grid-template-areas:"header" "navigation" "footer";\n  grid-template-rows:auto minmax(0,1fr) auto;' in source
assert ".wm-sidebar-body{\n  grid-area:navigation;\n  min-width:0;\n  min-height:0;\n  overflow:hidden;\n  display:flex;\n  flex-direction:column" in source
assert ".wm-sidebar-navigation{\n  flex:1 1 auto;\n  min-width:0;\n  min-height:0;\n  overflow-y:auto;\n  overscroll-behavior:contain" in source
assert ".contact-directory-tools{position:static;z-index:4;box-sizing:border-box;flex:0 0 auto;" in directory

# Directory sync preserves the actual list scroll position, not the whole sidebar body.
assert "const scrollHost=host.closest('.wm-sidebar-navigation');" in directory

# Footer actions remain one compact horizontal row; V21.72.42 reserves a narrow icon-only logout column.
assert ".shell-sidebar-account-footer{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 42px;gap:4px;" in source
assert ".shell-sidebar-account-footer .shell-sidebar-account-main,.shell-sidebar-account-footer .shell-sidebar-account-action,.shell-sidebar-account-footer .zalo-account-admin-open{width:100%;min-width:0;height:38px;min-height:38px;" in source
assert ".shell-sidebar-account-footer .shell-sidebar-account-avatar,.shell-sidebar-account-footer .shell-sidebar-account-copy span,.shell-sidebar-account-footer .shell-sidebar-account-chevron{display:none}" in source

# The long admin label is compact in the footer while accessibility keeps the full destination name.
assert "button.textContent='Cài đặt';" in zalo
assert "button.setAttribute('aria-label','Cài đặt tài khoản');" in zalo

print("V21.72.41 directory fixed tools/footer row contract PASS")
