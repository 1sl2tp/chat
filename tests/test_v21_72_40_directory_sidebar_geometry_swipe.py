from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

source=read("index.source.html")
shell=read("shell.js")

# Final PR-head contract: keep the established release checkpoint unchanged.
assert "V21.72.39" in source

# Desktop directory gets visibly wider without becoming an oversized rail.
assert "--desktop-directory-width:clamp(328px,27vw,340px);" in source

# Desktop pointer layout compacts only the account/footer chrome; mobile touch sizes stay intact.
assert "/* V21.72.40 — desktop directory width + compact footer */" in source
assert ".shell-sidebar-account-footer{padding:8px 0 8px;gap:6px}" in source
assert ".shell-sidebar-account-main{min-height:58px;padding:5px 8px;border-radius:16px;grid-template-columns:40px minmax(0,1fr) 32px}" in source
assert ".shell-sidebar-account-avatar{width:40px;height:40px;flex-basis:40px}" in source
assert ".shell-sidebar-account-action,.zalo-account-admin-open{min-height:38px;border-radius:12px}" in source

# Mobile opens the existing sidebar from a deliberate left-edge horizontal swipe only.
assert "const MOBILE_SIDEBAR_EDGE_PX=28;" in shell
assert "const MOBILE_SIDEBAR_OPEN_DISTANCE_PX=56;" in shell
assert "function bindMobileSidebarEdgeSwipe(){" in shell
assert "startX>MOBILE_SIDEBAR_EDGE_PX" in shell
assert "dx>=MOBILE_SIDEBAR_OPEN_DISTANCE_PX" in shell
assert "Math.abs(dy)<=36" in shell
assert "setSidebar(true);" in shell
assert "appShell.addEventListener('touchstart',onTouchStart,{passive:true});" in shell
assert "appShell.addEventListener('touchmove',onTouchMove,{passive:false});" in shell
assert "appShell.addEventListener('touchend',onTouchEnd,{passive:true});" in shell
assert "bindMobileSidebarEdgeSwipe();" in shell

print("V21.72.40 directory sidebar geometry/swipe contract PASS")
