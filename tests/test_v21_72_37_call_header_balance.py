from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

source=read("index.source.html")
shell=read("shell.js")

assert "V21.72.37" in source

# Incoming call stays one line; actions already communicate what to do.
assert "state:'incoming',title:'Cuộc gọi đến',subtitle:'',timer:''" in shell
assert "Nhấn Nghe để trả lời" not in shell

# Every live call control shares one 40px visual height.
start=source.index('.call-focus-slot:not([data-call-ui-state="idle"]){')
end=source.index('.call-status-chip{',start)
non_idle=source[start:end]
assert "height:40px;" in non_idle
assert '.call-focus-button,' in non_idle
assert '.call-secondary-button{' in non_idle

# Compact widths balance Vietnamese labels without making one action too heavy.
for token in ["max-width:132px;","max-width:124px;","width:68px;","width:64px;","width:86px;","width:80px;"]:
    assert token in non_idle, token

# Text/icon rhythm is shared across primary and secondary actions.
focus=source[source.index('.call-focus-button{'):source.index('.call-secondary-button{')]
assert "gap:6px;" in focus
assert "font-size:13px;" in focus
assert '.call-focus-icon{width:18px;height:18px;display:block;flex:0 0 18px}' in source

secondary=source[source.index('.call-secondary-button{'):source.index('@keyframes call-status-wave')]
assert "gap:6px;" in secondary
assert "font-size:13px;" in secondary
assert '.call-secondary-icon{width:18px;height:18px;display:block;flex:0 0 18px}' in secondary

# Status remains visually secondary but readable.
status=source[source.index('.call-status-indicator{'):source.index('.call-focus-button{')]
assert "width:14px;" in status
assert "height:14px;" in status
assert "font-size:13px;" in status
assert "font-size:12.5px;" in status

print("V21.72.37 call header balance contract PASS")
