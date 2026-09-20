from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
css=(ROOT/'zalo-admin-link.css').read_text('utf-8')

def compact(value):
    return ''.join(value.split())

c=compact(css)

# Settings keeps its existing svh baseline and upgrades to dvh when supported.
assert 'height:min(86svh,760px);' in c
assert 'max-height:min(82svh,640px);' in c
assert '@supports(height:100dvh)' in c
assert 'height:min(86dvh,760px);' in c
assert 'max-height:min(82dvh,640px);' in c

# Mobile outer and nested settings layers track the visible dynamic viewport.
assert 'height:calc(100dvh-16px);' in c
assert 'max-height:calc(100dvh-16px);' in c

# List scroll ownership remains internal; the modal card itself stays clipped.
card=c[c.index('.zalo-account-card{'):c.index('.zalo-account-modal-head{')]
assert 'overflow:hidden' in card
list_block=c[c.index('.zalo-account-list{'):c.index('.zalo-account-row{')]
assert 'overflow:auto' in list_block

print('V21.72.64 Settings modal dynamic viewport PASS')
