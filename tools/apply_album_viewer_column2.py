from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str, label: str):
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count == 0:
        if new in text:
            return False
        raise AssertionError(f'{label}: source anchor missing')
    if count != 1:
        raise AssertionError(f'{label}: expected 1 anchor, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    return True


app = ROOT / 'app.js'
old_position = """function positionImageViewerBelowHeader(){
  if(!imageViewerOverlay)return 0;
  const top=regionTop?Math.max(0,regionTop.getBoundingClientRect().bottom):0;
  const host=stageLayout||document.getElementById('threadContent');
  const rect=host?.getBoundingClientRect?.()||null;
  const viewportWidth=Math.max(0,window.innerWidth||document.documentElement.clientWidth||0);
  const left=rect?Math.max(0,rect.left):0;
  const right=rect?Math.max(0,viewportWidth-rect.right):0;
  imageViewerOverlay.style.setProperty('--image-viewer-top',`${Math.round(top*100)/100}px`);
  imageViewerOverlay.style.setProperty('--image-viewer-left',`${Math.round(left*100)/100}px`);
  imageViewerOverlay.style.setProperty('--image-viewer-right',`${Math.round(right*100)/100}px`);
  return top;
}
"""
new_position = """function positionImageViewerBelowHeader(){
  if(!imageViewerOverlay)return 0;
  const top=regionTop?Math.max(0,regionTop.getBoundingClientRect().bottom):0;
  const host=stageLayout||document.getElementById('threadContent');
  const rect=host?.getBoundingClientRect?.()||null;
  const viewportWidth=Math.max(0,window.innerWidth||document.documentElement.clientWidth||0);
  const workThreadView=document.getElementById('workThreadView');
  const workspaceActive=appShell?.dataset?.desktopWorkspace==='true';
  const workRect=workspaceActive&&workThreadView?.getBoundingClientRect
    ?workThreadView.getBoundingClientRect()
    :null;
  const regionRight=(
    rect&&workRect&&workRect.width>0&&
    workRect.left>rect.left&&workRect.left<rect.right
  )?workRect.left:(rect?.right||viewportWidth);
  const left=rect?Math.max(0,rect.left):0;
  const right=Math.max(0,viewportWidth-regionRight);
  imageViewerOverlay.style.setProperty('--image-viewer-top',`${Math.round(top*100)/100}px`);
  imageViewerOverlay.style.setProperty('--image-viewer-left',`${Math.round(left*100)/100}px`);
  imageViewerOverlay.style.setProperty('--image-viewer-right',`${Math.round(right*100)/100}px`);
  return top;
}
"""
replace_once(app, old_position, new_position, 'desktop image viewer right boundary')

orientation = ROOT / 'chat-image-orientation.js'
text = orientation.read_text(encoding='utf-8')
geometry_style = """    .image-viewer-overlay[open]{
      left:var(--chat-image-viewer-left,var(--image-viewer-left,0px))!important;
      right:var(--chat-image-viewer-right,var(--image-viewer-right,0px))!important;
      top:var(--chat-image-viewer-top,var(--image-viewer-top,0px))!important;
    }
"""
if geometry_style in text:
    text = text.replace(geometry_style, '', 1)

start = text.find('function updateViewerBounds(){')
if start >= 0:
    end = text.find('function ensureViewerRotateControls(overlay){', start)
    if end < 0:
        raise AssertionError('orientation geometry helper end anchor missing')
    text = text[:start] + text[end:]
text = text.replace('  updateViewerBounds();\n', '', 1)
orientation.write_text(text, encoding='utf-8')

old_test = ROOT / 'tests/test_v21_chat_image_orientation_column.py'
old = old_test.read_text(encoding='utf-8')
old = old.replace(
    "assert '.image-viewer-overlay' in SRC and '#stageLayout' in SRC, 'large image viewer must be scoped to the chat column geometry'\nassert '--chat-image-viewer-left' in SRC and '--chat-image-viewer-right' in SRC, 'column bounds need explicit geometry variables'\n",
    "assert '.image-viewer-overlay' in SRC, 'rotation controls must still attach to the shared Chat image viewer'\nassert '--chat-image-viewer-left' not in SRC and '--chat-image-viewer-right' not in SRC, 'rotation module must not own viewer geometry'\nassert 'updateViewerBounds' not in SRC, 'app.js is the sole image/album viewer geometry owner'\n",
    1,
)
old_test.write_text(old, encoding='utf-8')

print('album viewer column-2 patch applied')
