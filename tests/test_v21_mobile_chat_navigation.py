from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
client = (ROOT / 'work-customer-summary.js').read_text('utf-8')
style = (ROOT / 'work-customer-summary.css').read_text('utf-8')

# Mobile conversation gestures are full-screen navigation, not the old edge drawer.
assert 'showMobileDirectory' in client, 'mobile chat must expose a full-screen directory transition'
assert 'hideMobileDirectory' in client, 'selecting a contact must leave the directory screen'
assert 'bindMobileChatSwipe' in client, 'mobile chat needs a whole-chat horizontal swipe owner'
assert 'MOBILE_CHAT_SWIPE_DISTANCE_PX' in client, 'whole-chat swipe needs an explicit distance threshold'
assert 'NavigationCommand?.openWork' in client or 'NavigationCommand.openWork' in client, 'swipe right must open Công việc'
assert "dx<=-MOBILE_CHAT_SWIPE_DISTANCE_PX" in client.replace(' ', ''), 'swipe left must return to Danh bạ'
assert "dx>=MOBILE_CHAT_SWIPE_DISTANCE_PX" in client.replace(' ', ''), 'swipe right must open Công việc'
assert 'stopImmediatePropagation' in client, 'new horizontal gesture must suppress the legacy edge-drawer swipe'
assert "[data-top-tab=\"chat\"]" in client or "[data-top-tab='chat']" in client, 'opening Trò chuyện must default to Danh bạ'
assert 'v21-active-contact-change' in client, 'choosing a contact must switch from Danh bạ to the chat thread'

# The directory is a real mobile screen, not the old narrow popup/drawer.
assert 'data-mobile-directory' in client, 'runtime must own an explicit mobile directory screen state'
assert 'data-mobile-directory="true"' in style, 'mobile directory state needs full-screen geometry'
assert '#shellNavigationLayer' in style and '.shell-navigation-panel' in style, 'directory geometry must override the existing shell layer'
assert 'width:100%' in style.replace(' ', ''), 'mobile directory panel must occupy the whole available width'
assert '.shell-navigation-backdrop' in style and 'display:none' in style.replace(' ', ''), 'mobile directory must not render a drawer backdrop'

# Work customer identity remains pinned while its own list scrolls below.
assert '.work-summary-detail-header' in style, 'customer detail header must have an explicit geometry owner'
assert 'position:sticky' in style.replace(' ', ''), 'customer name/summary header must stay pinned'
assert 'overflow:auto' in style.replace(' ', ''), 'work item list must keep its own scrolling region'

print('Mobile chat navigation + pinned Work header contract PASS')
