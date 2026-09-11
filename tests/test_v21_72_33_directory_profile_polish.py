from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

shell=read("shell.js")
source=read("index.source.html")

assert "V21.72.39" in source

# Semantic title owns the modal role, not a person's display name.
assert "title.textContent=selfMode?'Thông tin cá nhân':'Thông tin liên hệ';" in shell
assert "selfMode?'Đổi thông tin'" not in shell
assert 'aria-labelledby="shell-profile-title"' in shell
assert '<h2 id="shell-profile-title"></h2>' in shell

# Copy stays consistent with Auth naming.
assert '>Tên hiển thị</label>' in shell
assert "Tên hiển thị không được để trống" in shell

# Accessible affordances describe the destination without changing actions.
assert "Mở thông tin cá nhân" in shell
assert "Mở thông tin liên hệ" in shell

# Admin-only controls remain admin-only and unchanged.
assert "const managed=mode==='admin'&&authAccount?.role==='admin'&&target?.role==='user';" in shell
assert "data-profile-admin-actions hidden" in shell
assert ">Xóa tài khoản</button>" in shell
assert "model.locked_at?'Mở khóa tài khoản':'Khóa tài khoản'" in shell

# Directory body owns layout; navigation owns contact-list scrolling. Extra scrollbar styling may follow.
assert ".wm-sidebar-body{flex:1 1 auto;min-height:0;overflow:hidden;display:flex;flex-direction:column}" in source
assert ".wm-sidebar-navigation{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain" in source
footer=source[source.index(".shell-sidebar-account-footer{"):source.index(".shell-sidebar-account-avatar",source.index(".shell-sidebar-account-footer{"))]
assert "flex:0 0 auto;" in footer

print("V21.72.39 directory/profile polish contract PASS")
