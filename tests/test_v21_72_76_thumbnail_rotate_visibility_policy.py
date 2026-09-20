from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
src=(ROOT/'chat-image-orientation.js').read_text('utf-8')

# Thumbnail rotate stays a secondary action: hidden by default.
assert '.chat-image-rotate-button{' in src
assert 'opacity:0;pointer-events:none;' in src

# Fine-pointer desktop reveals it only when the media tile has user intent.
assert '@media(hover:hover) and (pointer:fine){' in src
assert '.media-image-tile:hover>.chat-image-rotate-button' in src
assert '.media-image-tile:focus-within>.chat-image-rotate-button' in src
assert '.chat-image-rotate-button:focus-visible{opacity:1;pointer-events:auto}' in src

# Coarse/touch input does not permanently cover every thumbnail.
assert '@media(hover:none),(pointer:coarse){' in src
assert '.media-image-tile>.chat-image-rotate-button{display:none}' in src

# Rotation capability remains available in the shared image viewer on all inputs.
assert 'data-chat-viewer-rotate-left' in src
assert 'data-chat-viewer-rotate-right' in src
assert '.chat-image-viewer-rotate-controls' in src

# No mobile-only thumbnail size rule should revive the hidden overlay.
assert '.chat-image-rotate-button{width:28px;height:28px;right:6px;top:6px}' not in src

print('V21.72.76 thumbnail rotate visibility policy PASS')
