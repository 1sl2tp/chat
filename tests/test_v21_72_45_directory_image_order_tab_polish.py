from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text('utf-8')

source = read('index.source.html')
directory = read('contact-directory-admin.js')
sync = read('v21-sync-engine.js')

# Filtered contact results stay packed at the top instead of stretching auto
# grid tracks across the full navigation height.
assert '[data-v21-contact-list]{align-content:start;grid-auto-rows:max-content}' in source

# Single-image media follows the same sender-edge ownership as galleries while
# preserving the current shared media-width owner.
assert '.user-message-unit>.media-image-tile[data-image-presentation]{margin-left:auto}' in source
assert '.assistant-message-unit>.media-image-tile[data-image-presentation]{margin-right:auto}' in source
app=read('app.js')
assert 'const MESSAGE_MEDIA_WIDTH_PX=360;' in app
assert 'const MESSAGE_PORTRAIT_WIDTH_PX=260;' in app
assert 'const MESSAGE_PORTRAIT_MAX_HEIGHT_PX=560;' in app
assert "if(sourceRatio<1)" in app
assert 'messageInlineImageHeightLimit' not in app

# Directory order is activity-owned only. Equal activity keeps stable store
# order; display-name/profile edits are never a sort key.
sort_start=directory.index('function sortDirectoryContacts(')
sort_end=directory.index('async function invokeBody(',sort_start)
sorter=directory[sort_start:sort_end]
assert 'if(activity)return activity;' in sorter
assert 'return 0;' in sorter
assert sorter.index('if(activity)return activity;') < sorter.index('return 0;')
assert 'if(!reorder)return active;' in sorter  # Search keeps normalized store order
assert "localeCompare(bn,'vi'" not in directory

# Account/profile events must not erase conversation activity/preview fields
# when those fields are absent from the realtime payload.
assert 'function mergeContactEventPreservingActivity(cached,payload,eventPayload)' in sync
assert 'mergeContactEventPreservingActivity(cached,payload,event?.payload)' in sync

# Active-contact identity uses the remaining width while Công việc stays fully visible.
assert 'grid-template-columns:minmax(0,1fr) max-content;' in source

print('V21.72.45 directory/image/order/tab polish contract PASS')
