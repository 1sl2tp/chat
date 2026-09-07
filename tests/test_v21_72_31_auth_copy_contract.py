from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

source=read("index.source.html")
shell=read("shell.js")

assert "V21.72.31" in source
assert '<label class="guest-auth-field-label" for="guest-auth-name">Tên hiển thị</label>' in source
assert '<label class="guest-auth-field-label" for="guest-auth-account">Tên đăng nhập</label>' in source
assert '<span class="wm-button__label" data-auth-primary-label>Đăng nhập</span>' in source
assert '<span data-auth-switch-prefix>Chưa đăng ký?</span>' in source
assert '<span class="wm-button__label" data-auth-secondary-label>Tạo mới</span>' in source

assert "if(primary)primary.textContent=authMode==='register'?'Đăng ký':'Đăng nhập';" in shell
assert "if(secondary)secondary.textContent=authMode==='register'?'Đăng nhập':'Tạo mới';" in shell
assert "if(switchPrefix)switchPrefix.textContent=authMode==='register'?'Đã đăng ký?':'Chưa đăng ký?';" in shell

for old in ["Về đăng nhập","Chưa có tài khoản?","Đã có tài khoản?"]:
    assert old not in shell, old

print("V21.72.31 auth copy cleanup contract PASS")
