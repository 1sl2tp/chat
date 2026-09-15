from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
client = (ROOT / 'work-customer-summary.js').read_text('utf-8')
style = (ROOT / 'work-customer-summary.css').read_text('utf-8')
shell = (ROOT / 'shell.js').read_text('utf-8')

compact_client = ''.join(client.split())
compact_shell = ''.join(shell.split())
compact_style = ''.join(style.split())

# Mobile Trò chuyện is a parent branch: Danh bạ is the root, a customer thread is its child,
# and Công việc is a sibling branch. Gestures are owned by the whole mobile surface, never an edge drawer.
assert 'bindMobileHierarchySwipe' in client, 'mobile must have one hierarchy swipe owner for directory/chat/work surfaces'
assert 'MOBILE_CHAT_SWIPE_DISTANCE_PX' in client, 'hierarchy swipe needs an explicit horizontal threshold'
assert 'mobileConversationReturnState' in client, 'Work must remember the exact previous Trò chuyện state'
assert 'rememberConversationBeforeWork' in client, 'entering Work must snapshot directory vs customer thread before navigation'
assert 'openWorkFromMobileConversation' in client, 'directory/chat -> Work must share one transition owner'
assert 'restoreConversationFromWork' in client, 'Work swipe-left/chat-tab must restore the previous Trò chuyện state'
assert "kind:'directory'" in compact_client and "kind:'contact'" in compact_client, 'return state must distinguish directory from a specific customer thread'
assert 'navigation()?.openContact?.' in client or 'navigation().openContact' in client, 'restoring a customer thread must reopen the remembered customer'
assert 'stopImmediatePropagation' in client, 'horizontal gesture must claim the gesture once it is recognized'

# Direction contract: Danh bạ -> right -> Work; customer chat -> left -> Danh bạ / right -> Work;
# Work -> left -> exact prior Trò chuyện state. There is no wrap-around on the opposite directions.
assert 'mobileDirectoryOpen' in client, 'gesture owner must know whether Trò chuyện is currently at the Danh bạ parent'
assert 'route===\'work\'' in compact_client or 'route==="work"' in compact_client, 'gesture owner must branch explicitly for Work'
assert 'dx<=-MOBILE_CHAT_SWIPE_DISTANCE_PX' in compact_client, 'left swipe must be explicitly handled'
assert 'dx>=MOBILE_CHAT_SWIPE_DISTANCE_PX' in compact_client, 'right swipe must be explicitly handled'
assert 'showMobileDirectory' in client and 'hideMobileDirectory' in client, 'Danh bạ remains a real Trò chuyện screen'

# Regression: customer A -> Danh bạ -> customer A must still behave as a fresh selection.
# Directory may clear the shell activeContact, but the Work return state is stored separately before that clear.
assert 'clearActiveContact' in shell, 'shell navigation must expose explicit active-contact clearing'
assert 'setActiveContact(null' in compact_shell, 'clear command must reset the real shell activeContact state'
assert 'clearActiveContact' in client, 'entering the directory parent must clear the selected contact for same-customer reselection'
assert 'rememberConversationBeforeWork' in client and 'clearActiveContact' in client, 'return-state memory and shell contact clearing must be separate concerns'

# Hamburger on mobile is account/settings/logout only. It must never open the contact directory/sidebar.
assert 'openMobileAccountMenu' in client and 'closeMobileAccountMenu' in client, 'mobile hamburger needs a compact account menu owner'
for label in ('Tài khoản', 'Cài đặt', 'Thoát'):
    assert label in client, f'mobile account menu must contain {label}'
assert 'V21ZaloAccountAdmin' in client, 'Cài đặt must reuse the existing settings/account admin surface'
assert 'data-account-self-edit' in client, 'Tài khoản must reuse the existing self-profile action'
assert 'data-auth-command="logout"' in client or "data-auth-command='logout'" in client, 'Thoát must reuse the existing logout action'
assert "showMobileDirectory('menu-button')" not in client, 'hamburger must not open Danh bạ'
assert 'data-mobile-account-menu' in style, 'compact mobile account menu needs its own geometry'

# Danh bạ is a full Trò chuyện screen on mobile, not a narrow popup/drawer, and account footer is not part of it.
assert 'dataset.mobileDirectory' in client, 'runtime must own explicit mobile directory screen state'
assert 'data-mobile-directory="true"' in style, 'mobile directory state needs full-screen geometry'
assert '#shellNavigationLayer' in style and '.shell-navigation-panel' in style, 'directory screen may reuse the existing contact DOM owner'
assert 'width:100%' in compact_style, 'mobile directory must occupy the whole available content width'
assert '.shell-navigation-backdrop' in style and 'display:none' in compact_style, 'mobile directory must not render a drawer backdrop'
assert '.shell-sidebar-account-footer' in style and 'display:none!important' in compact_style, 'mobile directory must not carry the old sidebar account/footer chrome'

# Work customer identity remains pinned while its own list scrolls below.
assert '.work-summary-detail-header' in style, 'customer detail header must have an explicit geometry owner'
assert 'position:sticky' in compact_style, 'customer name/summary header must stay pinned'
assert 'overflow:auto' in compact_style, 'work item list must keep its own scrolling region'

print('Mobile hierarchy swipe + compact account menu + pinned Work header contract PASS')
