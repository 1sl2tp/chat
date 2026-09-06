from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

source=(ROOT/'index.source.html').read_text('utf-8')
sw=(ROOT/'sw.js').read_text('utf-8')

assert 'V21.72.18' in source
assert '.guest-auth-form{' in source
assert 'grid-template-columns:minmax(0,1fr) minmax(0,1fr)' in source
assert '.guest-auth-control{' in source
assert 'grid-column:1/-1' in source

button_block=source[source.index('.guest-auth-primary,'):source.index('.guest-auth-primary{',source.index('.guest-auth-primary,'))]
assert 'min-width:0' in button_block

assert "RELEASE_VERSION='V21.72.18'" in sw
assert "MODULE_CONTRACT_VERSION='pwa-sw-v1'" in sw
assert "CACHE_NAME='taphoa-chat-shell-'+RELEASE_VERSION" in sw

print('V21.72.18 auth actions row / PWA SW release contract PASS')
