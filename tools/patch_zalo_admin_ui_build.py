from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
source_path = ROOT / 'index.source.html'
verify_path = ROOT / 'tools' / 'verify_current.py'
source = source_path.read_text('utf-8')

old_release = '<meta name="app-release-version" content="V21.72.39">'
new_release = '<meta name="app-release-version" content="V21.73.0">'
if old_release in source:
    source = source.replace(old_release, new_release, 1)
elif new_release not in source:
    raise SystemExit('unexpected release marker')

css_tag = '<link rel="stylesheet" href="./zalo-admin-link.css" data-build-source="zalo-admin-link.css">'
if css_tag not in source:
    needle = '<link rel="stylesheet" href="./reference/chatgpt/full-source/raw-css/app-dBt1eElS.css" data-build-source="reference/chatgpt/full-source/raw-css/app-dBt1eElS.css">'
    if needle not in source:
        raise SystemExit('css insertion point not found')
    source = source.replace(needle, needle + '\n' + css_tag, 1)

js_tag = '<script src="./zalo-admin-link.js" data-build-source="zalo-admin-link.js"></script>'
if js_tag not in source:
    needle = '<script src="./auth-session-store.js" data-build-source="auth-session-store.js"></script>'
    if needle not in source:
        raise SystemExit('js insertion point not found')
    source = source.replace(needle, needle + '\n' + js_tag, 1)

source_path.write_text(source, 'utf-8')

verify = verify_path.read_text('utf-8')
if "'zalo-admin-link.js'" not in verify:
    needle = "'runtime-id.js','audio-capture-policy.js','app.js','shell.js','call-screen-wake-lock.js','auth-session-store.js',"
    replacement = "'runtime-id.js','audio-capture-policy.js','app.js','shell.js','call-screen-wake-lock.js','auth-session-store.js','zalo-admin-link.js',"
    if needle not in verify:
        raise SystemExit('verify node-check insertion point not found')
    verify = verify.replace(needle, replacement, 1)

ui_test = "subprocess.run([sys.executable,'-m','pytest','-q',str(ROOT/'tests'/'test_v21_zalo_admin_ui_contract.py')],check=True,cwd=ROOT)"
if ui_test not in verify:
    marker = "subprocess.run(['node',str(ROOT/'tests'/'test_v21_zalo_webview_runtime_error.js')],check=True,cwd=ROOT)"
    if marker not in verify:
        raise SystemExit('verify UI test insertion point not found')
    verify = verify.replace(marker, marker + '\n' + ui_test, 1)
verify_path.write_text(verify, 'utf-8')

subprocess.run([sys.executable, str(ROOT / 'tools' / 'build_current_preview.py')], check=True, cwd=ROOT)
