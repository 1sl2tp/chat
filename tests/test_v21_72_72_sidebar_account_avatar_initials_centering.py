from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'index.source.html').read_text('utf-8')

start=source.index('.shell-sidebar-account-footer .shell-sidebar-account-avatar{')
end=source.index('}',start)
rule=source[start:end+1]

# Footer account avatar must preserve the shared avatar centering owner.
assert 'display:grid;' in rule
assert 'place-items:center;' in rule

# Keep the current footer avatar geometry unchanged; this checkpoint only
# restores child centering, not row/avatar sizing.
assert 'width:34px;' in rule
assert 'height:34px;' in rule
assert 'min-width:34px;' in rule
assert 'min-height:34px;' in rule
assert 'display:block;' not in rule

# Shared avatar source remains the canonical circular surface.
shared_start=source.index('.contact-avatar-source{')
shared_end=source.index('}',shared_start)
shared=source[shared_start:shared_end+1]
assert 'display:grid;' in shared
assert 'place-items:center;' in shared
assert 'border-radius:50%;' in shared

print('V21.72.72 sidebar account avatar initials centering PASS')
