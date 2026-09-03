# TAPHOA — CHATWOOT SOURCE LOCK

Branch base: `demo/chatwoot-web-v1-5`

## Rule

TAPHOA uses Chatwoot source as the UI/UX owner. Do not redraw, restyle, or invent replacement UI for an existing Chatwoot component.

Allowed changes:
1. Rename visible branding from Chatwoot to TAPHOA.
2. Remove features that TAPHOA does not need.
3. Replace data/runtime adapters behind existing UI contracts.
4. Add a feature only when there is an existing Chatwoot Web/Mobile source pattern to reuse.

## Keep from Chatwoot Web

- Login: `routes/login/Login.vue`
- App shell: `routes/dashboard/Dashboard.vue`
- Sidebar geometry: `components/layout/Sidebar.vue`
- Conversation route: `routes/dashboard/conversation/ConversationView.vue`
- Conversation list: `components/ChatList.vue`
- Conversation frame/header: `components/widgets/conversation/ConversationBox.vue`, `ConversationHeader.vue`
- Message stream: `MessagesView.vue`, `Message.vue`
- Message bubbles: `bubble/Text.vue`, `bubble/Image.vue`, `bubble/File.vue`, native audio attachment rendering
- Message actions/context menu: `bubble/Actions.vue`, `MessageContextMenu.vue`
- Composer: `ReplyBox.vue`, `WootWriter/ReplyTopPanel.vue`, `ReplyBottomPanel.vue`
- Attachment preview: `AttachmentsPreview.vue`
- Emoji, typing indicator, canned response, enter-to-send, drag/drop upload
- Notification bell and Chatwoot toast/alert infrastructure
- Contact panel owner/geometry until a later explicit removal decision

## Keep from Chatwoot Mobile as source patterns when needed

- Audio recorder
- Audio bubble/player
- Image/file/video/location/reply message bubbles
- Reply box, voice record button, photo command button, send button
- Conversation list/item/header
- Inbox list/header
- Notification preferences and notification state
- Chat navigation transitions and mobile screen ownership

## Remove / do not expose

- Reports
- Contacts directory as a separate business module
- Teams
- Labels management
- Agent management
- Inbox management
- Integrations/applications
- Account switching/creation
- Chatwoot support widget
- Other CRM/admin modules not required for User ↔ Admin chat

## Runtime target

UI ownership remains Chatwoot. TAPHOA runtime target remains:
- Supabase for auth/chat/state/storage
- LiveKit for audio/video call
- PWA for web/iOS/Android installation

Do not change Chatwoot geometry to accommodate runtime. Runtime adapters must fit the existing UI owners.

## Single-admin reduction

- Chatwoot conversation header geometry is kept.
- Agent assignment selector is removed because TAPHOA has one Admin owner.
- Existing Chatwoot conversation actions remain until reviewed one-by-one.
