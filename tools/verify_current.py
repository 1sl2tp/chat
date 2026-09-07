from pathlib import Path
import hashlib, json, subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
version=json.loads((ROOT/'version.json').read_text('utf-8'))
release=str(version.get('version') or '')
assert release=='V21.72.35', release
committed=(ROOT/'index.html').read_bytes()
subprocess.run([sys.executable,str(ROOT/'tools'/'build_current_preview.py')],check=True,cwd=ROOT)
generated=(ROOT/'index.html').read_bytes()
if generated!=committed:
    import difflib
    before=committed.decode('utf-8').splitlines()
    after=generated.decode('utf-8').splitlines()
    diff=list(difflib.unified_diff(before,after,fromfile='committed/index.html',tofile='generated/index.html',n=3))
    print('\n'.join(diff[:240]))
assert generated==committed,'index.html is not synchronized with modular source'
sha=hashlib.sha256(generated).hexdigest()
expected=str(version.get('index_sha256') or '')
if expected:
    assert sha==expected,(sha,expected)
for n in [
    'runtime-id.js','audio-capture-policy.js','app.js','shell.js','call-screen-wake-lock.js','auth-session-store.js',
    'conversation-core.js','keyboard-inset-core.js','v21-cache-store.js','v21-media-cache.js',
    'v21-message-store.js','v21-call-engine.js','v21-livekit-session.js',
    'v21-realtime-session.js','v21-sync-engine.js','app-update-controller.js','shell-form-viewport-policy.js','sw.js'
]:
    subprocess.run(['node','--check',str(ROOT/n)],check=True,cwd=ROOT)
subprocess.run([sys.executable,'-m','pytest','-q',str(ROOT/'tests'/'test_v21_72_14_viewport_scope_lifecycle.py')],check=True,cwd=ROOT)
subprocess.run(['node',str(ROOT/'tests'/'test_v21_72_14_message_scope_runtime.js')],check=True,cwd=ROOT)
subprocess.run(['node',str(ROOT/'tests'/'test_v21_72_15_media_hydration_error_scope.js')],check=True,cwd=ROOT)
subprocess.run(['node',str(ROOT/'tests'/'test_v21_72_15_open_contact_network_recovery.js')],check=True,cwd=ROOT)
subprocess.run([sys.executable,str(ROOT/'tests'/'test_v21_72_16_audio_pwa_contract.py')],check=True,cwd=ROOT)
subprocess.run(['node',str(ROOT/'tests'/'test_v21_72_16_audio_policy_runtime.js')],check=True,cwd=ROOT)
subprocess.run(['node',str(ROOT/'tests'/'test_v21_72_16_update_runtime.js')],check=True,cwd=ROOT)
subprocess.run([sys.executable,str(ROOT/'tests'/'test_v21_72_17_mobile_form_keyboard_contract.py')],check=True,cwd=ROOT)
subprocess.run(['node',str(ROOT/'tests'/'test_v21_72_17_mobile_form_keyboard_runtime.js')],check=True,cwd=ROOT)
subprocess.run([sys.executable,str(ROOT/'tests'/'test_v21_72_18_auth_actions_row.py')],check=True,cwd=ROOT)
subprocess.run([sys.executable,str(ROOT/'tests'/'test_v21_72_19_profile_username_avatar.py')],check=True,cwd=ROOT)
subprocess.run([sys.executable,str(ROOT/'tests'/'test_v21_72_24_conversation_content_axis.py')],check=True,cwd=ROOT)
subprocess.run([sys.executable,str(ROOT/'tests'/'test_v21_72_27_reply_visual_contract.py')],check=True,cwd=ROOT)
subprocess.run([sys.executable,str(ROOT/'tests'/'test_v21_72_28_image_presentation_owner.py')],check=True,cwd=ROOT)
subprocess.run([sys.executable,str(ROOT/'tests'/'test_v21_72_29_link_file_presentation.py')],check=True,cwd=ROOT)
subprocess.run([sys.executable,str(ROOT/'tests'/'test_v21_72_30_chat_polish_lock.py')],check=True,cwd=ROOT)
subprocess.run([sys.executable,str(ROOT/'tests'/'test_v21_72_31_auth_copy_contract.py')],check=True,cwd=ROOT)
subprocess.run([sys.executable,str(ROOT/'tests'/'test_v21_72_32_auth_copy_contract.py')],check=True,cwd=ROOT)
subprocess.run([sys.executable,str(ROOT/'tests'/'test_v21_72_33_directory_profile_polish.py')],check=True,cwd=ROOT)
subprocess.run([sys.executable,str(ROOT/'tests'/'test_v21_72_34_audio_recorder_runtime.py')],check=True,cwd=ROOT)
subprocess.run([sys.executable,str(ROOT/'tests'/'test_v21_72_35_scroll_control_route_stability.py')],check=True,cwd=ROOT)
subprocess.run(['node',str(ROOT/'tests'/'test_v21_72_20_call_screen_wake_lock.js')],check=True,cwd=ROOT)
print(f'V21.72.35 canonical source verify PASS sha256={sha}')
