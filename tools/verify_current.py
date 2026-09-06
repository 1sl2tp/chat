from pathlib import Path
import hashlib, subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
EXPECTED='580e65f75103fac0dbed974acdaafb3f58606c36d3eda0142793106b15490a44'
subprocess.run([sys.executable,str(ROOT/'tools'/'build_current_preview.py')],check=True,cwd=ROOT)
assert hashlib.sha256((ROOT/'index.html').read_bytes()).hexdigest()==EXPECTED
for n in ['runtime-id.js','app.js','shell.js','auth-session-store.js','conversation-core.js','keyboard-inset-core.js','v21-cache-store.js','v21-media-cache.js','v21-message-store.js','v21-call-engine.js','v21-livekit-session.js','v21-realtime-session.js','v21-sync-engine.js']:
    subprocess.run(['node','--check',str(ROOT/n)],check=True,cwd=ROOT)
subprocess.run([sys.executable,'-m','pytest','-q',str(ROOT/'tests'/'test_v21_72_14_viewport_scope_lifecycle.py')],check=True,cwd=ROOT)
subprocess.run(['node',str(ROOT/'tests'/'test_v21_72_14_message_scope_runtime.js')],check=True,cwd=ROOT)
subprocess.run(['node',str(ROOT/'tests'/'test_v21_72_15_media_hydration_error_scope.js')],check=True,cwd=ROOT)
subprocess.run(['node',str(ROOT/'tests'/'test_v21_72_15_open_contact_network_recovery.js')],check=True,cwd=ROOT)
print('V21.72.15 canonical source verify PASS')
