from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

source=(ROOT/'index.source.html').read_text('utf-8')
shell=(ROOT/'shell.js').read_text('utf-8')
sw=(ROOT/'sw.js').read_text('utf-8')

assert 'V21.72.25' in source
assert '.guest-auth-form{' in source
auth_form=source[source.index('.guest-auth-form{'):source.index('.guest-auth-control{')]
assert 'grid-template-columns:minmax(0,1fr)' in auth_form
assert 'minmax(0,1fr) minmax(0,1fr)' not in auth_form
assert '.guest-auth-switch-row{' in source
assert 'data-auth-switch-prefix' in source
assert 'Chưa có tài khoản?' in source
assert 'data-password-toggle' in source
assert '.shell-form-password-toggle{' in source
assert '.guest-auth-primary{' in source
assert '.guest-auth-control:has(.guest-auth-field[aria-invalid="true"]) .guest-auth-field-label' in source
assert 'var(--theme-border-danger,#e11900)' in source
primary=source[source.index('.guest-auth-primary{'):source.index('.guest-auth-primary .wm-button__label')]
assert 'min-height:58px' in primary
assert "primary.textContent='Tiếp tục'" in shell
assert "secondary.textContent=authMode==='register'?'Về đăng nhập':'Tạo tài khoản'" in shell
assert "switchPrefix.textContent=authMode==='register'?'Đã có tài khoản?':'Chưa có tài khoản?'" in shell
assert '>Tiếp tục</span>' in source
assert '>Tạo tài khoản</span>' in source
assert 'setPasswordVisibility' in shell
assert 'shouldAutoFocusShellForm' in shell

assert "RELEASE_VERSION='V21.72.25'" in sw
assert "MODULE_CONTRACT_VERSION='pwa-sw-v1'" in sw
assert "CACHE_NAME='taphoa-chat-shell-'+RELEASE_VERSION" in sw

print('V21.72.25 auth single-action form / PWA SW release contract PASS')
