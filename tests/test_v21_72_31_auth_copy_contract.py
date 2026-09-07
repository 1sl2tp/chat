from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

source=read("index.source.html")
shell=read("shell.js")

assert "V21.72.34" in source
assert '<label class="guest-auth-field-label" for="guest-auth-name">Tên hiển thị</label>' in source
assert '<label class="guest-auth-field-label" for="guest-auth-account">Tên đăng nhập</label>' in source
assert '<span class="wm-button__label" data-auth-primary-label>Tiếp tục</span>' in source
assert '<span data-auth-switch-prefix>Bạn chưa có tài khoản? Hãy</span>' in source
assert '<span class="wm-button__label" data-auth-secondary-label>đăng ký</span>' in source

assert "if(primary)primary.textContent='Tiếp tục';" in shell
assert "if(secondary)secondary.textContent=authMode==='register'?'đăng nhập':'đăng ký';" in shell
assert "if(switchPrefix)switchPrefix.textContent=authMode==='register'?'Bạn đã có tài khoản? Hãy':'Bạn chưa có tài khoản? Hãy';" in shell

for old in ["Về đăng nhập","Chưa đăng ký?","Đã đăng ký?","Tạo mới"]:
    assert old not in shell, old

print("V21.72.34 auth copy cleanup contract PASS")
