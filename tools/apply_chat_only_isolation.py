from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
index_path = ROOT / "index.source.html"
shell_path = ROOT / "shell.js"
bridge_path = ROOT / "getlink-auth-bridge.js"

src = index_path.read_text(encoding="utf-8")

src, n_tab = re.subn(
    r'\n\s*<button type="button" class="top-mode-tab" role="tab" aria-selected="true" data-top-tab="work" data-nav-target="work">Công việc</button>',
    "",
    src,
    count=1,
)

src, n_view = re.subn(
    r'\n\s*<div id="workThreadView" class="thread-mode-view" data-thread-view="work" hidden>\s*'
    r'<div class="work-thread-frame" data-work-frame-owner="getlink">\s*'
    r'<iframe\s+id="workGetlinkFrame".*?</iframe>\s*'
    r'</div>\s*</div>',
    "",
    src,
    count=1,
    flags=re.S,
)

src, n_bridge = re.subn(
    r'\n\s*<script src="\./getlink-auth-bridge\.js" data-build-source="getlink-auth-bridge\.js"></script>',
    "",
    src,
    count=1,
)

assert (n_tab, n_view, n_bridge) == (1, 1, 1), (n_tab, n_view, n_bridge)
index_path.write_text(src, encoding="utf-8")

shell = shell_path.read_text(encoding="utf-8")
replacements = {
    "const ROUTES=Object.freeze(['chat','work']);": "const ROUTES=Object.freeze(['chat']);",
    "let route='work';": "let route='chat';",
    "route:ROUTES.includes(route)?route:'work',": "route:ROUTES.includes(route)?route:'chat',",
    "route=ROUTES.includes(saved?.route)?saved.route:'work';": "route=ROUTES.includes(saved?.route)?saved.route:'chat';",
    "  openWork(){return this.open('work')}\n": "",
}
for old, new in replacements.items():
    count = shell.count(old)
    assert count == 1, (old, count)
    shell = shell.replace(old, new, 1)
shell_path.write_text(shell, encoding="utf-8")

if bridge_path.exists():
    bridge_path.unlink()

subprocess.run(["python", str(ROOT / "tools/build_current_preview.py")], cwd=ROOT, check=True)
print("Chat-only isolation applied")
