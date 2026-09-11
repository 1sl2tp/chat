from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / 'index.source.html').read_text('utf-8')

# Active-contact avatar is larger than the previous 20px, but still safely
# contained within the existing 38px tab height.
assert '.top-mode-contact-avatar{width:26px;height:26px;flex:0 0 26px;' in SRC
assert 'min-width:26px;min-height:26px;max-width:26px;max-height:26px;' in SRC
assert '.top-mode-tab{' in SRC and 'min-height:38px;' in SRC

# Default state remains balanced 1/2 + 1/2.
assert 'grid-template-columns:minmax(0,1fr) minmax(0,1fr);' in SRC

# When an active contact is shown, Work keeps its intrinsic width and the
# contact tab consumes only the remaining space. Work must never be ellipsized.
identity = '.top-mode-switch[data-contact-identity="true"]{\n  grid-template-columns:minmax(0,1fr) max-content;\n}'
assert identity in SRC
assert '.top-mode-tab[data-top-tab="work"]{min-width:max-content;' in SRC

# Only the contact label is allowed to truncate.
assert '.top-mode-tab[data-top-tab="chat"] [data-chat-tab-label]{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' in SRC

print('V21.72.48 contact tab content-width contract PASS')
