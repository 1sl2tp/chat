from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
client = (ROOT / 'work-customer-summary.js').read_text('utf-8')
style = (ROOT / 'work-customer-summary.css').read_text('utf-8')
shell = (ROOT / 'shell.js').read_text('utf-8')
source = (ROOT / 'index.source.html').read_text('utf-8')
directory = (ROOT / 'contact-directory-admin.js').read_text('utf-8')

compact_client = ''.join(client.split())
compact_shell = ''.join(shell.split())
compact_style = ''.join(style.split())
compact_source = ''.join(source.split())
compact_directory = ''.join(directory.split())

# Mobile Trò chuyện is a parent branch: Danh bạ is the root, a customer thread is its child,
# and Công việc is a sibling branch. Gestures are owned by the whole mobile surface, never an edge drawer.
assert 'bindMobileHierarchySwipe' in client, 'mobile must have one hierarchy swipe owner for directory/chat/work surfaces'
assert 'MOBILE_CHAT_SWIPE_DISTANCE_PX=48' in compact_client, 'center swipe threshold should be an easier 48px'
assert 'MOBILE_CHAT_SWIPE_EDGE_INSET_PX=28' in compact_client, 'swipe must reserve 28px at both screen edges'
assert 'mobileConversationReturnState' in client, 'Work must remember the exact previous Trò chuyện state'
assert 'rememberConversationBeforeWork' in client, 'entering Work must snapshot directory vs customer thread before navigation'
assert 'openWorkFromMobileConversation' in client, 'directory/chat -> Work must share one transition owner'
assert 'restoreConversationFromWork' in client, 'Work swipe-left/chat-tab must restore the previous Trò chuyện state'
assert "kind:'directory'" in compact_client and "kind:'contact'" in compact_client, 'return state must distinguish directory from a specific customer thread'
assert 'navigation()?.openContact?.' in client or 'navigation().openContact' in client, 'restoring a customer thread must reopen the remembered customer'
assert 'stopImmediatePropagation' in client, 'horizontal gesture must claim the gesture once it is recognized'
assert 'window.innerWidth-MOBILE_CHAT_SWIPE_EDGE_INSET_PX' in compact_client, 'swipe start must reject the reserved right-edge zone'
assert 'touch.clientX<MOBILE_CHAT_SWIPE_EDGE_INSET_PX' in compact_client, 'swipe start must reject the reserved left-edge zone'
assert "button,a,[role=\"button\"]" in client or "button,a,[role='button']" in client, 'swipe must not steal gestures that start on controls'

# Direction contract: Danh bạ -> right -> Work; customer chat -> left -> Danh bạ / right -> Work;
# Work -> left -> exact prior Trò chuyện state. There is no wrap-around on the opposite directions.
assert 'mobileDirectoryOpen' in client, 'gesture owner must know whether Trò chuyện is currently at the Danh bạ parent'
assert 'route===\'work\'' in compact_client or 'route==="work"' in compact_client, 'gesture owner must branch explicitly for Work'
assert 'dx<=-MOBILE_CHAT_SWIPE_DISTANCE_PX' in compact_client, 'left swipe must be explicitly handled'
assert 'dx>=MOBILE_CHAT_SWIPE_DISTANCE_PX' in compact_client, 'right swipe must be explicitly handled'
assert 'showMobileDirectory' in client and 'hideMobileDirectory' in client, 'Danh bạ remains a real Trò chuyện screen'

# Top tabs: single tap preserves current navigation semantics; double tap jumps to the branch root.
assert 'MOBILE_TAB_DOUBLE_TAP_MS=250' in compact_client, 'double tap needs a short explicit timing window'
assert 'handleMobileTopTabTap' in client, 'top tabs need one tap/double-tap arbitration owner'
assert "showMobileDirectory('chat-tab-double')" in client, 'double tap Trò chuyện must always return to Danh bạ'
assert 'resetWorkSelectionForDirectory' in client, 'double tap Công việc must clear customer detail selection'
assert "forceOverview=true" in compact_client, 'double tap Công việc must force Tổng hợp overview'
assert 'setTimeout' in client and 'clearTimeout' in client, 'single tap must be deferred/cancelled so double tap does not flicker through the single action first'

# Regression: customer A -> Danh bạ -> customer A must still behave as a fresh selection.
# Directory may clear the shell activeContact, but the Work return state is stored separately before that clear.
assert 'clearActiveContact' in shell, 'shell navigation must expose explicit active-contact clearing'
assert 'setActiveContact(null' in compact_shell, 'clear command must reset the real shell activeContact state'
assert 'clearActiveContact' in client, 'entering the directory parent must clear the selected contact for same-customer reselection'
assert 'rememberConversationBeforeWork' in client and 'clearActiveContact' in client, 'return-state memory and shell contact clearing must be separate concerns'

# Hamburger on mobile owns navigation/account actions, never the old contact drawer.
assert 'openMobileAccountMenu' in client and 'closeMobileAccountMenu' in client, 'mobile hamburger needs a compact account menu owner'
for label in ('Danh bạ', 'Tài khoản', 'Cài đặt', 'Thoát'):
    assert label in client, f'mobile account menu must contain {label}'
assert 'data-mobile-account-action="directory"' in client, 'mobile account menu must expose an explicit Danh bạ action'
assert "showMobileDirectory('account-menu-directory')" in client, 'Danh bạ menu action must open the real directory screen'
assert 'V21ZaloAccountAdmin' in client, 'Cài đặt must reuse the existing settings/account admin surface'
assert 'data-account-self-edit' in client, 'Tài khoản must reuse the existing self-profile action'
assert 'data-auth-command="logout"' in client or "data-auth-command='logout'" in client, 'Thoát must reuse the existing logout action'
assert "showMobileDirectory('menu-button')" not in client, 'hamburger must not open Danh bạ implicitly'
assert 'data-mobile-account-menu' in style, 'compact mobile account menu needs its own geometry'

# Work detail back button follows its origin: chat-origin returns to that chat; overview-origin returns to overview.
assert 'workDetailBackMode' in client, 'Work detail needs an explicit back-target owner'
assert "'Quay lại'" in client or '"Quay lại"' in client, 'chat-origin Work detail must label the control as Quay lại'
assert "dataset.workSummaryBack='conversation'" in compact_client or 'dataset.workSummaryBack="conversation"' in compact_client, 'chat-origin detail must mark the back action as conversation'
assert "restoreConversationFromWork('work-detail-back')" in client, 'chat-origin detail back must restore the prior chat state'
assert "dataset.workSummaryBack='overview'" in compact_client or 'dataset.workSummaryBack="overview"' in compact_client, 'overview-origin detail must mark the back action as overview'
assert 'renderOverview(rowsCache)' in client, 'overview-origin detail back must return to Tổng hợp'

# Guest mobile must never be trapped behind the full-screen directory overlay.
# The login card is owned by Chat; directory is authenticated-only.
assert "snapshot().state!=='AUTHENTICATED'" in compact_client or "snapshot().state!==\"AUTHENTICATED\"" in compact_client, 'mobile directory must be gated to authenticated sessions'
assert 'AuthUI?.openLogin?.()' in client or 'AuthUI.openLogin' in client, 'guest hamburger/auth transition must expose the existing login form'
assert "hideMobileDirectory('guest-auth')" in client, 'guest auth state must remove the directory overlay before showing login'
assert ("auth.state==='AUTHENTICATED'" in compact_client or "auth.state===\"AUTHENTICATED\"" in compact_client or
        "snapshot().state==='AUTHENTICATED'" in compact_client or "snapshot().state===\"AUTHENTICATED\"" in compact_client), 'boot/default directory must only open after authentication'

# Danh bạ is a full Trò chuyện screen on mobile, not a narrow popup/drawer, and account footer is not part of it.
assert 'dataset.mobileDirectory' in client, 'runtime must own explicit mobile directory screen state'
assert 'data-mobile-directory="true"' in style, 'mobile directory state needs full-screen geometry'
assert '#shellNavigationLayer' in style and '.shell-navigation-panel' in style, 'directory screen may reuse the existing contact DOM owner'
assert 'width:100%' in compact_style, 'mobile directory must occupy the whole available content width'
assert '.shell-navigation-backdrop' in style and 'display:none' in compact_style, 'mobile directory must not render a drawer backdrop'
assert '.shell-sidebar-account-footer' in style and 'display:none!important' in compact_style, 'mobile directory must not carry the old sidebar account/footer chrome'

# Mobile directory visual rhythm: title sits closer to search, and row manage ellipsis is touch-hidden.
assert '@media(max-width:640px)' in compact_directory, 'mobile directory tools need an explicit narrow-screen rhythm owner'
assert '.contact-directory-tools{margin-top:-12px' in compact_directory, 'Danh bạ title/search gap must be tightened on mobile'
assert '@media(hover:none),(pointer:coarse)' in compact_source, 'touch devices need an explicit contact-manage visibility rule'
assert '.shell-contact-manage{display:none!important}' in compact_source, 'touch devices must not show the row ellipsis by default'
assert '.shell-contact-row:hover .shell-contact-manage' in source, 'desktop ellipsis must appear only from row hover'
assert '.shell-contact-row:focus-within .shell-contact-manage' in source, 'desktop keyboard focus must keep the manage action reachable'

# Work customer identity remains pinned while its own list scrolls below.
assert '.work-summary-detail-header' in style, 'customer detail header must have an explicit geometry owner'
assert 'position:sticky' in compact_style, 'customer name/summary header must stay pinned'
assert 'overflow:auto' in compact_style, 'work item list must keep its own scrolling region'

print('Mobile center swipe + double-tap roots + hierarchy navigation + pinned Work header contract PASS')
