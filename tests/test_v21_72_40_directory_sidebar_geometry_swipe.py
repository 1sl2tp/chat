from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

source=read("index.source.html")
shell=read("shell.js")
client=read("work-customer-summary.js")

# Final PR-head contract: keep the established release checkpoint unchanged.
assert "V21.72.39" in source

# Responsive desktop directory stays substantial but yields more room to Chat at the 2-column threshold.
assert "--desktop-directory-width:clamp(300px,26vw,340px);" in source

# Desktop pointer layout compacts only the account/footer chrome; desktop directory remains intact.
assert "/* V21.72.40 — desktop directory width + compact footer */" in source
assert ".shell-sidebar-account-footer{padding:8px 0 8px;gap:6px}" in source
assert ".shell-sidebar-account-main{min-height:58px;padding:5px 8px;border-radius:16px;grid-template-columns:40px minmax(0,1fr) 32px}" in source
assert ".shell-sidebar-account-avatar{width:40px;height:40px;flex-basis:40px}" in source
assert ".shell-sidebar-account-action,.zalo-account-admin-open{min-height:38px;border-radius:12px}" in source

# Mobile no longer owns a first-column/sidebar gesture. Horizontal navigation is full-surface hierarchy navigation.
assert "function bindMobileSidebarEdgeSwipe(){" not in shell, 'obsolete left-edge drawer gesture must be removed from shell runtime'
assert "MOBILE_SIDEBAR_EDGE_PX" not in shell, 'mobile must not reserve the left edge for opening the directory'
assert "MOBILE_SIDEBAR_OPEN_DISTANCE_PX" not in shell, 'old edge drawer threshold must be retired'
assert "bindMobileSidebarEdgeSwipe();" not in shell, 'old edge drawer listener must not be mounted'
assert "bindMobileHierarchySwipe" in client, 'mobile horizontal gestures belong to the hierarchy navigation owner'
assert "openMobileAccountMenu" in client, 'hamburger is account/settings/logout, not directory/sidebar'

print("V21.72.40 desktop directory geometry + retired mobile edge sidebar contract PASS")
