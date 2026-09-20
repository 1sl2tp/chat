from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'index.source.html').read_text('utf-8')

def compact(value):
    return ''.join(value.split())

c=compact(source)

# Desktop keeps its existing svh baseline but upgrades the highest layout owner to dvh.
assert '#appShell[data-auth-state="authenticated"]#screenHost{' in c
assert 'height:100svh;' in c
assert '@supports(height:100dvh)' in c
assert '#appShell[data-auth-state="authenticated"]#screenHost{height:100dvh}' in c

# Old browsers still retain a vh fallback.
assert '@supportsnot(height:100svh)' in c
assert '#appShell[data-auth-state="authenticated"]#screenHost{height:100vh}' in c

# Responsive region ownership remains unchanged.
assert 'grid-template-columns:var(--desktop-directory-width)minmax(0,1fr)' in c
assert '@media(min-width:80rem)and(hover:hover)and(pointer:fine)' in c

print('V21.72.60 global desktop dynamic viewport owner PASS')
