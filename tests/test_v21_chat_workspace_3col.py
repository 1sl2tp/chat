from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "index.source.html").read_text(encoding="utf-8")
SHELL = (ROOT / "shell.js").read_text(encoding="utf-8")
SHELL_CSS = (ROOT / "zalo-admin-link.css").read_text(encoding="utf-8")

# Desktop becomes one working surface: persistent directory | chat | work.
assert "DESKTOP_WORKSPACE_QUERY" in SHELL
assert "desktopWorkspaceMedia" in SHELL
assert "data.desktopWorkspace" in SHELL or "dataset.desktopWorkspace" in SHELL
assert "desktopWorkspace?false:route!=='chat'" in "".join(SHELL.split())
assert "desktopWorkspace?false:route!=='work'" in "".join(SHELL.split())

compact_shell = "".join(SHELL.split())

# Authentication is the state transition that makes the desktop workspace eligible.
# Recompute workspace mode there; otherwise boot writes data-desktop-workspace=false
# and the directory appears while the work iframe remains hidden until a media-query change.
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

# PC proportions: directory compact, chat deliberately moderate, work iframe gets the rest.
assert "--desktop-directory-width:clamp(260px,17vw,300px)" in SOURCE
assert "--desktop-chat-width:clamp(420px,28vw,560px)" in SOURCE
assert "--desktop-work-width:calc(100% - var(--desktop-chat-width))" in SOURCE

# The chat stage must size to its active grid cell, not the full viewport.
compact_css = "".join(SHELL_CSS.split())
assert '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#stageLayout{width:100%;}' in compact_css

# Mobile/narrow layout keeps the existing one-view-at-a-time route model.
assert "const ROUTES=Object.freeze(['chat','work']);" in SHELL
assert "route!=='chat'" in SHELL
assert "route!=='work'" in SHELL

print("desktop chat workspace 3-column contract PASS")
