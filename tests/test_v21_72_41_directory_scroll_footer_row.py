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

# Footer exposes one ChatGPT-style account row; secondary actions live in its popover.
assert '<div class="shell-sidebar-account-menu" data-account-menu role="menu" aria-label="Tài khoản" hidden>' in source
assert ".shell-sidebar-account-footer{\n  position:relative;\n  display:block;" in source
assert "grid-template-columns:34px minmax(0,1fr) 28px;" in source
assert ".shell-sidebar-account-footer>.shell-sidebar-account-action,\n.shell-sidebar-account-footer>.zalo-account-admin-open{\n  display:none!important;" in source
assert ".shell-sidebar-account-menu{\n  position:absolute;" in source

# Existing settings action remains the backend/action owner, but is visually consolidated.
assert "button.textContent='Cài đặt';" in zalo
assert "button.setAttribute('aria-label','Cài đặt tài khoản');" in zalo
assert "toggleAccountMenu()" in shell
assert "data-account-menu-profile" in source
assert "data-account-menu-settings" in source
assert "data-account-menu-logout" in source

print("V21.72.41 directory fixed tools/footer row contract PASS")


# Renderer preserves the list scroll owner established by the sidebar geometry.
shell=read("shell.js")
assert "const scrollHost=host.closest('.wm-sidebar-navigation');" in shell
assert "const scrollHost=host.closest('.wm-sidebar-body');" not in shell
