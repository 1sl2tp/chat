from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'index.source.html').read_text('utf-8')

def compact(value):
    return ''.join(value.split())

c=compact(source)

# Region 3 keeps the existing svh fallback but upgrades to dvh when supported.
assert '#appShell[data-route="work"]#workThreadView{' in c
assert 'height:calc(100svh-var(--header-height,72px)-var(--composer-flow-reserve,0px));' in c
assert '@supports(height:100dvh)' in c
assert '#appShell[data-route="work"]#workThreadView,#workThreadView:not([hidden]){height:calc(100dvh-var(--header-height,72px)-var(--composer-flow-reserve,0px));}' in c

# Wide desktop keeps its absolute column owner and must not inherit a forced viewport height.
desktop=source[source.index('/* Desktop work surface: Danh bạ | Trò chuyện | Công việc.'):source.index('/* Region 1 footer follows')]
assert 'height:auto;' in desktop

print('V21.72.59 Region 3 mobile dynamic viewport PASS')
