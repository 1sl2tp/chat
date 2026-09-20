from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'index.source.html').read_text('utf-8')

def compact(value):
    return ''.join(value.split())

c=compact(source)

# Mobile keeps the existing svh baseline in markup and the old-vh fallback.
assert 'id="stageLayout"class="stage-layoutflexh-svhw-screenflex-col' in c
assert '@supportsnot(height:100svh){#stageLayout{height:100vh}#svhProbe{height:100vh}}' in c

# The highest one-screen owner prefers dvh on narrow/coarse/non-hover runtimes.
marker='/*Top-levelmobile/narrowviewportowner:keepsvhasthecompatibilitybaseline,butpreferdvh'
assert marker in c
block=c[c.index(marker):c.index('/*V21geometryownermap:',c.index(marker))]
assert '@supports(height:100dvh)' in block
assert '@media(max-width:63.999rem),(hover:none),(pointer:coarse)' in block
assert '#stageLayout{height:100dvh}' in block

# The stable svh probe remains intentionally unchanged for keyboard detection.
assert '#svhProbe{position:fixed;' in c
assert 'height:100svh;' in c

# Desktop remains separately owned by screenHost rather than inheriting this change.
assert '#appShell[data-auth-state="authenticated"]#screenHost{height:100dvh}' in c

print('V21.72.66 global mobile dynamic viewport owner PASS')
