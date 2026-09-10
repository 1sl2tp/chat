from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
source_path = ROOT / "index.source.html"
shell_path = ROOT / "shell.js"

source = source_path.read_text(encoding="utf-8")

replacements = [
    (
        'data-default-route="work" data-route="work"',
        'data-default-route="chat" data-route="chat"',
    ),
    (
        '          <button type="button" class="top-mode-tab" role="tab" aria-selected="false" data-top-tab="chat" data-nav-target="chat">Trò chuyện</button>\n',
        '          <button type="button" class="top-mode-tab" role="tab" aria-selected="false" data-top-tab="chat" data-nav-target="chat">Trò chuyện</button>\n'
        '          <button type="button" class="top-mode-tab" role="tab" aria-selected="false" data-top-tab="work" data-nav-target="work">Công việc</button>\n',
    ),
    (
        '              <div id="bottomSpacer" data-chat-thread-node aria-hidden="true"></div>\n'
        '            </div>\n'
        '          </div>',
        '              <div id="bottomSpacer" data-chat-thread-node aria-hidden="true"></div>\n'
        '            </div>\n'
        '            <div id="workThreadView" class="thread-mode-view" data-thread-view="work" hidden>\n'
        '              <div class="work-thread-frame" data-work-frame-owner="getlink">\n'
        '                <iframe\n'
        '                  id="workGetlinkFrame"\n'
        '                  class="work-thread-embed"\n'
        '                  src="https://get.taphoa.xyz/?embed=1"\n'
        '                  title="Công việc"\n'
        '                  loading="eager"\n'
        '                  referrerpolicy="strict-origin-when-cross-origin"\n'
        '                ></iframe>\n'
        '              </div>\n'
        '            </div>\n'
        '          </div>',
    ),
    (
        '<script src="./auth-session-store.js" data-build-source="auth-session-store.js"></script>\n',
        '<script src="./auth-session-store.js" data-build-source="auth-session-store.js"></script>\n'
        '<script src="./getlink-auth-bridge.js" data-build-source="getlink-auth-bridge.js"></script>\n',
    ),
]

for old, new in replacements:
    count = source.count(old)
    assert count == 1, (old[:120], count)
    source = source.replace(old, new, 1)

source_path.write_text(source, encoding="utf-8")

shell = shell_path.read_text(encoding="utf-8")
shell_replacements = [
    (
        "const ROUTES=Object.freeze(['chat']);",
        "const ROUTES=Object.freeze(['chat','work']);",
    ),
    (
        "  openChat(){return this.open('chat')},\n};",
        "  openChat(){return this.open('chat')},\n  openWork(){return this.open('work')}\n};",
    ),
]
for old, new in shell_replacements:
    count = shell.count(old)
    assert count == 1, (old, count)
    shell = shell.replace(old, new, 1)

shell_path.write_text(shell, encoding="utf-8")

subprocess.run(["python", str(ROOT / "tools/build_current_preview.py")], cwd=ROOT, check=True)
print("Thin GETLINK work embed applied")
