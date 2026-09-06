from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text('utf-8')

policy=read('shell-form-viewport-policy.js')
for token in [
    "MODULE_CONTRACT_VERSION='shell-form-viewport-v1'",
    "RELEASE_VERSION='V21.72.18'",
    'visualViewport',
    'focusin',
    'focusout',
    'guestAuthThread',
    'shell-profile-card',
    'dataset.mobileKeyboard',
    '--shell-form-vv-top',
    '--shell-form-vv-height',
    'requestAnimationFrame'
]:
    assert token in policy, token

for forbidden in [
    'scrollRoot.scrollTop',
    'window.scrollTo(',
    'document.scrollingElement',
    'setTimeout('
]:
    assert forbidden not in policy, forbidden

source=read('index.source.html')
assert 'V21.72.18' in source
assert './shell-form-viewport-policy.js' in source
assert '.guest-auth-thread[data-mobile-keyboard="true"]' in source
assert '.shell-profile-overlay[data-mobile-keyboard="true"]' in source
assert '--shell-form-vv-height' in source

shell=read('shell.js')
login=shell[shell.index('openLogin(){'):shell.index('setMode(mode)',shell.index('openLogin(){'))]
assert 'scrollIntoView' not in login

print('V21.72.18 mobile form keyboard contract PASS')
