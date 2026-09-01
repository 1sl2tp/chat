import { mountVoiceCallUi } from './call/ui'
import { VoiceCallSession, type VoiceCallContext } from './call/voice-session'
import { getChatMessageState, subscribeChatMessages } from './chat/message-runtime'
import { sendSupportText, startChatRuntime } from './chat/runtime'
import { getChatRuntimeState, subscribeChatRuntime } from './chat/store'
import { CallPushRegistration } from './notifications/call-push-registration'
import { notificationButtonPresentation } from './notifications/presentation'
import { installNotificationContextResponder } from './notifications/window-context'
import { setupPwa } from './pwa'
import { supabase } from './supabase/client'
import { prepareFixedTestRuntime } from './user/fixed-runtime'
import { setupViewportController } from './viewport/controller'
import './call/call.css'
import './user.css'

const rootElement = document.querySelector<HTMLDivElement>('#app')
if (!rootElement) throw new Error('Missing #app root')
const root: HTMLDivElement = rootElement

root.innerHTML = `
  <main class="user-app">
    <header>
      <strong>Admin hỗ trợ · test</strong>
      <div class="user-header-actions">
        <span id="status">Đang kết nối…</span>
        <button id="call-notifications" class="call-notification-button" type="button" hidden>Bật thông báo</button>
        <button id="voice-call" class="chat-call-button" type="button" aria-label="Gọi thoại">☎</button>
      </div>
    </header>
    <section id="messages" class="messages"><p class="empty">Bạn cần hỗ trợ gì?</p></section>
    <form id="composer" class="composer">
      <input id="text" autocomplete="off" placeholder="Nhập tin nhắn…" aria-label="Tin nhắn" />
      <button type="submit">Gửi</button>
    </form>
  </main>
  <div id="voice-call-host"></div>
`

const messages = root.querySelector<HTMLElement>('#messages')!
const status = root.querySelector<HTMLElement>('#status')!
const form = root.querySelector<HTMLFormElement>('#composer')!
const input = root.querySelector<HTMLInputElement>('#text')!
const submit = form.querySelector<HTMLButtonElement>('button')!
const callButton = root.querySelector<HTMLButtonElement>('#voice-call')!
const notificationButton = root.querySelector<HTMLButtonElement>('#call-notifications')!
const callHost = root.querySelector<HTMLElement>('#voice-call-host')!

let callPushRegistration: CallPushRegistration | null = null
let callPushDeviceId = ''
let disposeCallPushState: (() => void) | null = null
let notificationActionPending = false

function currentProfileId(): string {
  const identity = getChatRuntimeState().identity
  if (!identity || typeof identity !== 'object') return ''
  const profile = (identity as { profile?: unknown }).profile
  if (!profile || typeof profile !== 'object') return ''
  return String((profile as { id?: unknown }).id ?? '')
}

function currentCallContext(): VoiceCallContext | null {
  const chat = getChatRuntimeState()
  if (chat.phase !== 'ready' || !chat.identity || typeof chat.identity !== 'object') return null

  const identity = chat.identity as { profile?: unknown; device_id?: unknown }
  const profile = identity.profile && typeof identity.profile === 'object'
    ? identity.profile as { id?: unknown }
    : null
  const support = chat.supportEntry && typeof chat.supportEntry === 'object'
    ? chat.supportEntry as { conversation_id?: unknown; admin_profile?: unknown }
    : null
  const admin = support?.admin_profile && typeof support.admin_profile === 'object'
    ? support.admin_profile as { display_name?: unknown }
    : null

  const profileId = String(profile?.id ?? '')
  const deviceId = String(identity.device_id ?? '')
  const conversationId = String(support?.conversation_id ?? '')
  if (!profileId || !deviceId || !conversationId) return null

  return {
    profileId,
    deviceId,
    conversationId,
    peerName: String(admin?.display_name ?? 'Admin hỗ trợ'),
  }
}

const callSession = new VoiceCallSession(supabase, currentCallContext)
mountVoiceCallUi(callHost, callSession)
callSession.start()

function setupCallPushRegistration(): void {
  const deviceId = currentCallContext()?.deviceId ?? ''
  if (!deviceId || deviceId === callPushDeviceId) return

  disposeCallPushState?.()
  callPushDeviceId = deviceId
  notificationActionPending = false
  callPushRegistration = new CallPushRegistration(supabase, deviceId)
  disposeCallPushState = callPushRegistration.subscribe(render)
  void callPushRegistration.sync()
}

function renderNotificationButton(): void {
  const registration = callPushRegistration
  if (!registration) {
    notificationButton.hidden = true
    return
  }

  const presentation = notificationButtonPresentation(
    registration.getState(),
    registration.getIssue(),
    notificationActionPending,
  )
  notificationButton.hidden = false
  notificationButton.disabled = presentation.disabled
  notificationButton.textContent = presentation.label
  notificationButton.title = registration.getDetail()
}

function render(): void {
  const chat = getChatRuntimeState()
  const messageState = getChatMessageState()
  const canSend = chat.phase === 'ready' && messageState.realtime !== 'error' && Boolean(messageState.conversationId)
  const callState = callSession.getState()

  status.textContent = chat.phase === 'error'
    ? 'Không thể kết nối'
    : messageState.realtime === 'subscribed'
      ? 'Đang hoạt động'
      : 'Đang kết nối…'

  renderNotificationButton()
  input.disabled = false
  submit.disabled = !canSend || !input.value.trim()
  callButton.disabled = !currentCallContext() || callState.phase !== 'idle'

  if (messageState.messages.length === 0) {
    messages.innerHTML = '<p class="empty">Bạn cần hỗ trợ gì?</p>'
    return
  }

  const me = currentProfileId()
  messages.replaceChildren(...messageState.messages.map((message) => {
    const row = document.createElement('div')
    row.className = message.sender_id === me ? 'msg mine' : 'msg'
    row.textContent = message.revoked_at ? 'Tin nhắn đã được thu hồi' : message.text ?? ''
    return row
  }))
  messages.scrollTop = messages.scrollHeight
}

input.addEventListener('input', render)
callButton.addEventListener('click', () => void callSession.startOutgoing())
notificationButton.addEventListener('click', async () => {
  const registration = callPushRegistration
  if (!registration || notificationActionPending) return
  callSession.prepareAlertAudioFromUserGesture()
  notificationActionPending = true
  renderNotificationButton()
  try {
    if (registration.getState() === 'enabled') {
      await registration.testFromUserGesture()
    } else {
      await registration.enableFromUserGesture()
    }
  } finally {
    notificationActionPending = false
    renderNotificationButton()
  }
})
form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  render()
  try {
    await sendSupportText(text)
  } catch {
    status.textContent = 'Gửi thất bại'
  }
})

subscribeChatRuntime(() => {
  setupCallPushRegistration()
  render()
})
subscribeChatMessages(render)
callSession.subscribe(render)
setupViewportController()
setupPwa()
installNotificationContextResponder(() => getChatMessageState().conversationId || null)
render()

async function startTestUser(): Promise<void> {
  await prepareFixedTestRuntime({
    async getCurrentUser() {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      const user = data.session?.user
      if (!user) return null
      return {
        email: user.email ?? null,
        isAnonymous: Boolean(user.is_anonymous),
      }
    },
    async signOut() {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    async signInAnonymously() {
      const { error } = await supabase.auth.signInAnonymously()
      if (error) throw error
    },
    async upgradeCurrentUser(displayName, username, password) {
      const { error } = await supabase.rpc('chat_upgrade_to_user2', {
        p_display_name: displayName,
        p_username: username,
        p_password: password,
      })
      if (error) throw error
    },
    async refreshSession() {
      const { error } = await supabase.auth.refreshSession()
      if (error) throw error
    },
  }, startChatRuntime)

  if (getChatRuntimeState().phase !== 'ready') return

  const result = await supabase.rpc('chat_set_my_test_profile')
  if (result.error) console.warn('Could not label test profile', result.error)
  setupCallPushRegistration()
  render()
}

void startTestUser().catch((error) => {
  console.error('Could not start fixed User 2', error)
  status.textContent = 'Không thể kết nối'
  render()
})
