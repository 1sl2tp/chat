from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
src=(ROOT/'index.source.html').read_text('utf-8')

def compact(value):
    return ''.join(value.split())

c=compact(src)

# Profile keeps the existing svh/VisualViewport baseline.
assert 'height:var(--shell-form-vv-height,100svh);' in c
assert 'max-height:calc(var(--shell-form-vv-height,100svh)-20px);' in c
assert 'max-height:calc(var(--shell-form-vv-height,100svh)-16px);' in c

# The profile viewport owner now prefers dvh whenever the browser supports it,
# while still allowing the VisualViewport pixel variable to take precedence.
marker='/*Profilemodalviewportowner:preservesvhasfallback,preferdvhwhenVisualViewporthasnotpublishedamoreprecisepixelheight.*/'
assert marker in c
block=c[c.index(marker):c.index('</style>',c.index(marker))]
assert '@supports(height:100dvh)' in block
assert '.shell-profile-overlay{height:var(--shell-form-vv-height,100dvh);}' in block
assert 'max-height:calc(var(--shell-form-vv-height,100dvh)-36px);' in block
assert 'max-height:calc(var(--shell-form-vv-height,100dvh)-20px);' in block
assert 'max-height:calc(var(--shell-form-vv-height,100dvh)-16px);' in block

# Existing modal and keyboard ownership remains unchanged.
assert '.shell-profile-card[data-mobile-keyboard="true"]' in c
assert '#screenHost[data-profile-modal-locked="true"]{pointer-events:none}' in c

print('V21.72.65 Profile modal dynamic viewport PASS')
