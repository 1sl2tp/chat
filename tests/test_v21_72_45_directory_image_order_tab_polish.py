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
# preserving the existing 256/320/400 presentation geometry.
assert '.user-message-unit>.media-image-tile[data-image-presentation]{margin-left:auto}' in source
assert '.assistant-message-unit>.media-image-tile[data-image-presentation]{margin-right:auto}' in source
assert 'width:256' in read('app.js')
assert 'width:320' in read('app.js')
assert 'width:400' in read('app.js')

# Directory order is activity-owned only. Equal activity keeps stable store
# order; display-name/profile edits are never a sort key.
assert 'if(activity)return activity;\n      return 0;' in directory
assert "localeCompare(bn,'vi'" not in directory

# Account/profile events must not erase conversation activity/preview fields
# when those fields are absent from the realtime payload.
assert 'function mergeContactEventPreservingActivity(cached,payload,eventPayload)' in sync
assert 'mergeContactEventPreservingActivity(cached,payload,event?.payload)' in sync

# Active-contact identity gets more width than Công việc so names remain useful.
assert 'grid-template-columns:minmax(0,2fr) minmax(0,1fr);' in source

print('V21.72.45 directory/image/order/tab polish contract PASS')
