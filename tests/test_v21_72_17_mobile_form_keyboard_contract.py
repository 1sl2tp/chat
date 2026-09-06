from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text('utf-8')

policy=read('shell-form-viewport-policy.js')
for token in [
    "MODULE_CONTRACT_VERSION='shell-form-viewport-v2'",
    "RELEASE_VERSION='V21.72.20'",
    'visualViewport',
    'focusin',
    'focusout',
    'guestAuthThread',
    'shell-profile-card',
    'dataset.mobileKeyboard',
    '--shell-form-keyboard-inset',
    'requestAnimationFrame'
]:
    assert token in policy, token

for forbidden in [
    'scrollRoot.scrollTop',
    'window.scrollTo(',
    'document.scrollingElement',
    '--shell-form-vv-top',
    '--shell-form-vv-height',
    '--shell-form-vv-content-top',
    '--shell-form-vv-content-height'
]:
    assert forbidden not in policy, forbidden

source=read('index.source.html')
assert 'V21.72.20' in source
assert './shell-form-viewport-policy.js' in source
assert '.guest-auth-thread[data-mobile-keyboard="true"]' in source
assert '.shell-profile-card[data-mobile-keyboard="true"]' in source
assert '#appShell[data-auth-state="guest"] #scrollRoot' in source
keyboard_css=source[source.index('@media(max-width:767px), (pointer:coarse)'):source.index('</style>')]
assert 'position:fixed' not in keyboard_css
assert '--shell-form-vv-' not in keyboard_css

shell=read('shell.js')
login=shell[shell.index('openLogin(){'):shell.index('setMode(mode)',shell.index('openLogin(){'))]
assert 'scrollIntoView' not in login
assert 'shouldAutoFocusShellForm()' in login
assert "Number(navigator.maxTouchPoints||0)>0" in shell

print('V21.72.20 stable mobile form keyboard contract PASS')
