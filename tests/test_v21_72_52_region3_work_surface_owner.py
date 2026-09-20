from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/"index.source.html").read_text("utf-8")

def compact(value):
    return "".join(value.split())

c=compact(source)

# Region 3 is a full surface owned by Work itself, not a card within a card.
assert "Region3outerowner:Workisascreen/columnsurface,notacardnestedinsideanotherscreen." in c
assert '#appShell[data-route="work"]#workThreadView{' in c
route_block=source[source.index('#appShell[data-route="work"] #workThreadView{'):source.index('#appShell[data-route="work"] [data-chat-thread-node]')]
assert "padding:0;" in route_block
assert "background:var(--theme-surface-primary);" in route_block

frame=source[source.index('.work-thread-frame{'):source.index('.work-thread-empty{')]
assert "border:0;" in frame
assert "border-radius:0;" in frame

# Wide desktop owns exactly one outer divider: WorkThreadView's inline-start border.
desktop=source[source.index('/* Desktop work surface: Danh bạ | Trò chuyện | Công việc.'):source.index('/* Region 1 footer follows')]
assert '#workThreadView{' in desktop
assert 'border-inline-start:1px solid var(--theme-border-default);' in desktop
desktop_frame=desktop[desktop.index('#workThreadView .work-thread-frame{'):desktop.index('#thread-bottom-container{')]
assert 'border:0;' in desktop_frame
assert 'border-inline-start' not in desktop_frame

# Mobile no longer wraps Work in a rounded/padded frame.
assert '#workThreadView:not([hidden]){padding:0;}' in c
assert '.work-thread-frame{border-radius:14px;}' not in c

print("V21.72.52 Region 3 work surface owner PASS")
