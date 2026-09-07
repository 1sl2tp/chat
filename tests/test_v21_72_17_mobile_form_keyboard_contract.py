from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text('utf-8')

policy=read('shell-form-viewport-policy.js')
for token in [
    "MODULE_CONTRACT_VERSION='shell-form-viewport-v3'",
    "RELEASE_VERSION='V21.72.32'",
    'visualViewport',
    'focusin',
    'focusout',
    'guestAuthThread',
    'shell-profile-card',
    'dataset.mobileKeyboard',
    '--shell-form-keyboard-inset',
    '--shell-form-vv-top',
    '--shell-form-vv-height',
    'publishViewport',
    'requestAnimationFrame'
]:
    assert token in policy, token

for forbidden in [
    'scrollRoot.scrollTop',
    'window.scrollTo(',
    'document.scrollingElement',
    '--shell-form-vv-content-top',
    '--shell-form-vv-content-height'
]:
    assert forbidden not in policy, forbidden

source=read('index.source.html')
assert 'V21.72.32' in source
assert './shell-form-viewport-policy.js' in source
assert '.guest-auth-thread[data-mobile-keyboard="true"]' in source
assert '.shell-profile-overlay[data-mobile-keyboard="true"]' in source
assert '.shell-profile-card[data-mobile-keyboard="true"]' in source
assert 'top:var(--shell-form-vv-top,0px)' in source
assert 'height:var(--shell-form-vv-height,100svh)' in source
assert 'max-height:calc(var(--shell-form-vv-height,100svh) - 16px)' in source
assert '#appShell[data-auth-state="guest"] #scrollRoot' in source
keyboard_css=source[source.index('@media(max-width:767px), (pointer:coarse)'):source.index('</style>')]
assert 'position:fixed' not in keyboard_css

shell=read('shell.js')
login=shell[shell.index('openLogin(){'):shell.index('setMode(mode)',shell.index('openLogin(){'))]
assert 'scrollIntoView' not in login
assert 'shouldAutoFocusShellForm()' in login
assert "Number(navigator.maxTouchPoints||0)>0" in shell

print('V21.72.32 visual viewport form keyboard contract PASS')
