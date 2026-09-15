from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "index.source.html").read_text(encoding="utf-8")
SHELL = (ROOT / "shell.js").read_text(encoding="utf-8")
SHELL_CSS = (ROOT / "zalo-admin-link.css").read_text(encoding="utf-8")
WORK_JS = (ROOT / "work-customer-summary.js").read_text(encoding="utf-8")
WORK_CSS = (ROOT / "work-customer-summary.css").read_text(encoding="utf-8")

# Desktop becomes one working surface: persistent directory | chat | work.
assert "DESKTOP_WORKSPACE_QUERY" in SHELL
assert "desktopWorkspaceMedia" in SHELL
assert "data.desktopWorkspace" in SHELL or "dataset.desktopWorkspace" in SHELL
assert "desktopWorkspace?false:route!=='chat'" in "".join(SHELL.split())
assert "desktopWorkspace?false:route!=='work'" in "".join(SHELL.split())

compact_shell = "".join(SHELL.split())

# Authentication is the state transition that makes the desktop workspace eligible.
assert "setAuthenticated(authenticated,account=null){" in compact_shell
assert "syncDesktopSidebarMode();syncDesktopWorkspaceMode();" in compact_shell

# Desktop work is not owned by the conversation scroller. Reparent the work view
# to stageLayout on wide desktop and restore it to its mobile home when narrowing.
assert "functionsyncDesktopWorkOwner(desktopWorkspace)" in compact_shell
assert "stageLayout.appendChild(workView)" in compact_shell
assert "workThreadHome.insertBefore(workView,workThreadNext)" in compact_shell

compact = "".join(SOURCE.split())
assert "--desktop-work-width" in SOURCE
assert 'data-desktop-workspace="true"' in SOURCE
assert '#workThreadView' in SOURCE
assert '#thread-bottom-container' in SOURCE
assert 'data-top-tab="work"' in SOURCE
assert '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#workThreadView' in compact
assert '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#thread-bottom-container' in compact
assert '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"][data-route="chat"]' not in compact

# Medium desktop must already fit Danh bạ + the full chat surface. Wide desktop
# adds Công việc only when there is enough room for a useful chat column.
assert "DESKTOP_DIRECTORY_QUERY='(min-width: 64rem)" in SHELL, 'fine-pointer desktop should enter 2-column mode from 64rem'
assert "DESKTOP_WORKSPACE_QUERY='(min-width: 80rem)" in SHELL, '3-column workspace must wait until 80rem'
assert '@media (min-width:64rem)' in SOURCE.replace(' ', ''), 'persistent directory CSS must match the 64rem runtime breakpoint'
assert '@media (min-width:80rem)' in SOURCE.replace(' ', ''), 'three-column CSS must match the 80rem runtime breakpoint'
assert "--desktop-directory-width:clamp(300px,26vw,340px)" in SOURCE
assert "--desktop-chat-width:clamp(520px,40vw,640px)" in SOURCE, 'wide desktop chat column must no longer collapse to ~420px'
assert "--desktop-work-width:calc(100% - var(--desktop-chat-width))" in SOURCE

# Mobile directory ownership must stop at the same 64rem breakpoint; otherwise
# 64-68rem desktops can accidentally get both persistent and mobile directory states.
assert '(min-width:64rem)' in WORK_JS.replace(' ', ''), 'mobile directory JS breakpoint must align with persistent desktop directory'
assert '@media(max-width:63.999rem)' in WORK_CSS.replace(' ', ''), 'mobile directory CSS breakpoint must align with persistent desktop directory'

# The chat stage must size to its active grid cell, not the full viewport.
compact_css = "".join(SHELL_CSS.split())
assert '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#stageLayout{width:100%;}' in compact_css

# Mobile/narrow layout keeps the existing one-view-at-a-time route model.
assert "const ROUTES=Object.freeze(['chat','work']);" in SHELL
assert "route!=='chat'" in SHELL
assert "route!=='work'" in SHELL

print("desktop chat workspace responsive 2/3-column contract PASS")
