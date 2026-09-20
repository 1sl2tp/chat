from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'index.source.html').read_text('utf-8')

row_start=source.index('.shell-contact-row{')
row_end=source.index('}',row_start)
row=source[row_start:row_end+1]
assert 'height:60px;' in row
assert 'min-height:60px;' in row

chat_start=source.index('.shell-contact-chat{')
chat_end=source.index('}',chat_start)
chat=source[chat_start:chat_end+1]
assert 'grid-template-columns:40px minmax(0,1fr);' in chat
assert 'column-gap:12px;' in chat
assert 'height:60px;' in chat
assert 'padding:7px 8px;' in chat

wrap_start=source.index('.shell-contact-avatar-wrap{')
wrap_end=source.index('}',wrap_start)
wrap=source[wrap_start:wrap_end+1]
assert 'width:40px;' in wrap
assert 'height:40px;' in wrap
assert 'align-self:center' in wrap

avatar_start=source.index('.shell-contact-avatar{')
avatar_end=source.index('}',avatar_start)
avatar=source[avatar_start:avatar_end+1]
for token in [
    'width:40px;',
    'height:40px;',
    'min-width:40px;',
    'min-height:40px;',
    'max-width:40px;',
    'max-height:40px;',
    'flex-basis:40px;'
]:
    assert token in avatar

# The shared source may default to 48px, but the contact-row child owner must
# completely override every size constraint so the rendered avatar cannot
# overflow its 40px wrapper or consume the 12px text gap.
shared_start=source.index('.contact-avatar-source{')
shared_end=source.index('}',shared_start)
shared=source[shared_start:shared_end+1]
assert 'min-width:48px;' in shared
assert 'max-width:48px;' in shared

print('V21.72.73 contact avatar true 40px geometry PASS')
