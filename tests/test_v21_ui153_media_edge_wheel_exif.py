from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
css=(ROOT/'index.source.html').read_text('utf-8')
app=(ROOT/'app.js').read_text('utf-8')
orientation=(ROOT/'chat-image-orientation.js').read_text('utf-8')

def rule(selector):
    anchor=css.index(selector+'{')
    return css[anchor:].split('}',1)[0]

# The visible outer edges of all media receive the SAME border/radius and
# no invisible extra padding. The album still has a 4px internal tile gap.
single=rule('.media-image-tile[data-image-presentation]')
gallery=rule('.media-gallery-grid')
for r in (single,gallery):
    assert 'padding:0;' in r
    assert 'border:0;' in r
    assert 'border-radius:14px' in r
    assert 'isolation:isolate;' in r
assert 'gap:4px!important;' in gallery
assert '.assistant-message-unit>.message-media-shell{margin-right:auto}' in css
assert '.user-message-unit>.message-media-shell{margin-left:auto}' in css

# Browsers honor EXIF orientation without probing media or rotating by
# screenshot content. Manual user rotation remains a fallback.
assert css.count('image-orientation:from-image;')>=3
assert 'function rotateAsset(assetId,delta)' in orientation
assert 'localStorage' in orientation

wheel=app[app.index("  main.addEventListener('wheel',event=>{"):app.index("  },{passive:false});",app.index("  main.addEventListener('wheel',event=>{"))]
assert "event.deltaMode===1?16:event.deltaMode===2?main.clientHeight:1" in wheel
assert "const factor=Math.exp(-delta*.0018);" in wheel
assert 'setImageViewerZoom(imageViewerZoom*factor' in wheel
assert 'event.preventDefault();' in wheel
assert 'showImageViewerIndex(next)' not in wheel
assert 'const browse=' not in wheel
thumbs=app[app.index("  thumbs.addEventListener('wheel',event=>{"):app.index("  thumbs.addEventListener('scroll',()=>{")]
assert 'thumbs.scrollLeft+=event.deltaY;' in thumbs
assert 'thumbs.scrollWidth<=thumbs.clientWidth+1' in thumbs
assert 'showImageViewerIndex' not in thumbs
assert "window.addEventListener('resize',syncOpenImageViewerRegion" in app
assert 'function collectConversationImageAssets()' in app
assert "imageViewerFilter='all';" in app
print('UI-153 media aligned / wheel zoom / EXIF auto + manual fallback PASS')
