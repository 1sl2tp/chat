from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

source=read("index.source.html")
app=read("app.js")

# Multi-image gallery uses the shared 360px media owner and remains responsive.
assert 'const MESSAGE_MEDIA_WIDTH_PX=360;' in app
assert 'width:${MESSAGE_MEDIA_WIDTH_PX}px;max-width:100%;gap:4px' in app
assert ".media-gallery-grid{\n  width:22.5rem!important;\n  max-width:100%;" in source
assert 'background:var(--theme-surface-secondary);' in source

# Outgoing galleries anchor to the sender edge even if the message unit has
# spare width after shrink-to-fit/max-width resolution.
assert ".user-message-unit>.media-gallery-grid{margin-left:auto}" in source

# Incoming gallery ownership stays left-aligned and image crop rules stay unchanged.
assert ".assistant-message-unit>.media-gallery-grid{margin-right:auto}" in source
assert ".media-gallery-grid .media-image-tile > img" in source
assert "object-fit:cover!important" in source

print("V21.72.43 gallery edge alignment contract PASS")
