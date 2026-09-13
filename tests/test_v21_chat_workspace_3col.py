from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "index.source.html").read_text(encoding="utf-8")
SHELL = (ROOT / "shell.js").read_text(encoding="utf-8")

# Desktop becomes one working surface: persistent directory | chat | work.
assert "DESKTOP_WORKSPACE_QUERY" in SHELL
assert "desktopWorkspaceMedia" in SHELL
assert "data.desktopWorkspace" in SHELL or "dataset.desktopWorkspace" in SHELL
assert "desktopWorkspace?false:route!=='chat'" in "".join(SHELL.split())
assert "desktopWorkspace?false:route!=='work'" in "".join(SHELL.split())

compact = "".join(SOURCE.split())
assert "--desktop-work-width" in SOURCE
assert 'data-desktop-workspace="true"' in SOURCE
assert '#workThreadView' in SOURCE
assert '#thread-bottom-container' in SOURCE
assert 'data-top-tab="work"' in SOURCE
assert '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#workThreadView' in compact
assert '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#thread-bottom-container' in compact
assert '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"][data-route="chat"]' not in compact

# Mobile/narrow layout keeps the existing one-view-at-a-time route model.
assert "const ROUTES=Object.freeze(['chat','work']);" in SHELL
assert "route!=='chat'" in SHELL
assert "route!=='work'" in SHELL

print("desktop chat workspace 3-column contract PASS")
