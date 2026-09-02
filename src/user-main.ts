import { mountVoiceCallUi } from './call/ui'
import { VoiceCallSession, type VoiceCallContext } from './call/voice-session'
import { getChatMessageState, subscribeChatMessages } from './chat/message-runtime'
import { sendSupportText, startChatRuntime, stopChatRuntime } from './chat/runtime'
import { getChatRuntimeState, subscribeChatRuntime } from './chat/store'
import { composerEnterAction, isMobileComposerEnvironment } from './chat/ui/composer-behavior'
import { getOrCreateDeviceKey } from './device/identity'
import { CallPushRegistration, callPushBrowserForRegistration } from './notifications/call-push-registration'
import { clearCurrentPushSubscription, pushCleanupBrowserForRegistration } from './notifications/push-cleanup'
import { notificationButtonPresentation } from './notifications/presentation'
import { installNotificationContextResponder } from './notifications/window-context'
import { setupPwa } from './pwa'
import { guestSupabase, userSupabase } from './supabase/client'
import { loginUser2, logoutUser2 } from './user/auth'
import { capabilitiesForRootMode } from './user/capabilities'
import { clearGuestLocalState, endGuestSession as teardownGuestSession } from './user/guest-lifecycle'
import { enterFreshGuest, resolveRootMode, type RootUserMode } from './user/root-session'
import { setupViewportController } from './viewport/controller'
import './call/call.css'
import './user.css'

const rootElement = document.querySelector<HTMLDivElement>('#app')
if (!rootElement) throw new Error('Missing #app root')
const root: HTMLDivElement = rootElement
const userPwaRegistrationPromise = setupPwa('user')
const mobileComposer = isMobileComposerEnvironment()

root.innerHTML = `
  <main class="user-app">
    <header>
      <div class="user-title">
        <strong>Admin hỗ trợ</strong>
        <small id="user-mode">Vãng lai</small>
      </div>
      <div class="user-header-actions">
        <span id="status">Đang kết nối…</span>
        <button id="call-notifications" class="call-notification-button" type="button" hidden>Bật thông báo</button>
        <button id="voice-call" class="chat-call-button" type="button" aria-label="Gọi thoại" hidden>☎</button>
        <button id="auth-action" class="user-auth-action" type="button">Đăng nhập</button>
      </div>
    </header>
    <section id="login-panel" class="user-login-panel" hidden>
      <form id="user-login-form">
        <input id="user-login" autocomplete="username" placeholder="Tài khoản" aria-label="Tài khoản" />
        <input id="user-password" type="password" autocomplete="current-password" placeholder="Mật khẩu" aria-label="Mật khẩu" />
        <button type="submit">Đăng nhập</button>
        <button id="login-cancel" type="button">Hủy</button>
        <p id="login-error" aria-live="polite"></p>
      </form>
    </section>
    <section id="messages" class="messages"><p class="empty">Bạn cần hỗ trợ gì?</p></section>
    <form id="composer" class="composer">
      <textarea id="text" rows="1" autocomplete="off" placeholder="Nhập tin nhắn…" aria-label="Tin nhắn"></textarea>
      <button type="submit">Gửi</button>
    </form>
  </main>
  <div id="voice-call-host"></div>
`

const messages = root.querySelector<HTMLElement>('#messages')!
const status = root.querySelector<HTMLElement>('#status')!
const modeLabel = root.querySelector<HTMLElement>('#user-mode')!
const form = root.querySelector<HTMLFormElement>('#composer')!
const input = root.querySelector<HTMLTextAreaElement>('#text')!
const submit = form.querySelector<HTMLButtonElement>('button')!
const callButton = root.querySelector<HTMLButtonElement>('#voice-call')!
const notificationButton = root.querySelector<HTMLButtonElement>('#call-notifications')!
const authAction = root.querySelector<HTMLButtonElement>('#auth-action')!
const loginPanel = root.querySelector<HTMLElement>('#login-panel')!
const loginForm = root.querySelector<HTMLFormElement>('#user-login-form')!
const loginInput = root.querySelector<HTMLInputElement>('#user-login')!
const passwordInput = root.querySelector<HTMLInputElement>('#user-password')!
const loginSubmit = loginForm.querySelector<HTMLButtonElement>('button[type="submit"]')!
const loginCancel = root.querySelector<HTMLButtonElement>('#login-cancel')!
const loginError = root.querySelector<HTMLElement>('#login-error')!
const callHost = root.querySelector<HTMLElement>('#voice-call-host')!

let rootMode: RootUserMode = 'guest'
let callSession: VoiceCallSession | null = null
let disposeCallUi: (() => void) | null = null
let disposeCallState: (() => void) | null = null
let callPushRegistration: CallPushRegistration | null = null
let callPushDeviceId = ''
let disposeCallPushState: (() => void) | null = null
let notificationActionPending = false
let authActionPending = false

function currentProfileId(): string {
  const identity = getChatRuntimeState().identity
  if (!identity || typeof identity !== 'object') return ''
  const profile = (identity as { profile?: unknown }).profile
  if (!profile || typeof profile !== 'object') return ''
  return String((profile as { id?: unknown }).id ?? '')
}

function currentCallContext(): VoiceCallContext | null {
  if (rootMode !== 'user2') return null
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

function clearCallPushRegistration(): void {
  disposeCallPushState?.()
  disposeCallPushState = null
  callPushRegistration = null
  callPushDeviceId = ''
  notificationActionPending = false
}

function stopUser2Capabilities(): void {
  clearCallPushRegistration()
  disposeCallState?.()
  disposeCallState = null
  callSession?.dispose()
  callSession = null
  disposeCallUi?.()
  disposeCallUi = null
  callHost.replaceChildren()
}

function startUser2Capabilities(): void {
  if (rootMode !== 'user2' || callSession) return
  callSession = new VoiceCallSession(userSupabase, currentCallContext)
  disposeCallUi = mountVoiceCallUi(callHost, callSession)
  disposeCallState = callSession.subscribe(render)
  callSession.start()
}

async function setupCallPushRegistration(): Promise<void> {
  if (!capabilitiesForRootMode(rootMode).push) {
    clearCallPushRegistration()
    return
  }

  const pwaRegistration = await userPwaRegistrationPromise
  if (!pwaRegistration || rootMode !== 'user2') return

  const deviceId = currentCallContext()?.deviceId ?? ''
  if (!deviceId || deviceId === callPushDeviceId) return

  clearCallPushRegistration()
  callPushDeviceId = deviceId
  callPushRegistration = new CallPushRegistration(
    userSupabase,
    deviceId,
    callPushBrowserForRegistration(pwaRegistration),
  )
  disposeCallPushState = callPushRegistration.subscribe(render)
  void callPushRegistration.sync()
}

function renderNotificationButton(): void {
  const registration = callPushRegistration
  if (!registration || !capabilitiesForRootMode(rootMode).push) {
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
  const capabilities = capabilitiesForRootMode(rootMode)
  const callState = callSession?.getState()

  modeLabel.textContent = rootMode === 'user2' ? 'User 2' : 'Vãng lai'
  authAction.textContent = rootMode === 'user2' ? 'Thoát' : 'Đăng nhập'
  authAction.disabled = authActionPending
  callButton.hidden = !capabilities.call
  callButton.disabled = !capabilities.call || !currentCallContext() || !callState || callState.phase !== 'idle'

  status.textContent = chat.phase === 'error'
    ? 'Không thể kết nối'
    : messageState.realtime === 'subscribed'
      ? 'Đang hoạt động'
      : 'Đang kết nối…'

  renderNotificationButton()
  input.disabled = false
  submit.disabled = !canSend || !input.value.trim()

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

async function endGuestSession(): Promise<void> {
  stopChatRuntime()
  await teardownGuestSession({
    async endRemoteGuest() {
      const result = await guestSupabase.rpc('chat_end_guest_session')
      if (result.error) throw result.error
    },
    async signOutGuest() {
      const result = await guestSupabase.auth.signOut()
      if (result.error) throw result.error
    },
  })
}

async function startGuestMode(): Promise<void> {
  rootMode = 'guest'
  stopUser2Capabilities()
  const pwaRegistration = await userPwaRegistrationPromise
  if (pwaRegistration) {
    await clearCurrentPushSubscription(pushCleanupBrowserForRegistration(pwaRegistration))
  }
  await startChatRuntime({
    client: guestSupabase,
    deviceKey: getOrCreateDeviceKey('guest'),
  })
  render()
}

async function startUser2Mode(): Promise<void> {
  rootMode = 'user2'
  await startChatRuntime({
    client: userSupabase,
    deviceKey: getOrCreateDeviceKey('user2'),
  })
  startUser2Capabilities()
  await setupCallPushRegistration()
  render()
}

async function bootRootMode(): Promise<void> {
  const mode = await resolveRootMode({
    async getUser2Session() {
      const result = await userSupabase.auth.getSession()
      if (result.error) throw result.error
      const user = result.data.session?.user
      return user ? { isAnonymous: Boolean(user.is_anonymous) } : null
    },
    async clearUser2Session() {
      const result = await userSupabase.auth.signOut()
      if (result.error) throw result.error
    },
  })

  if (mode === 'user2') {
    await startUser2Mode()
    return
  }

  await enterFreshGuest({
    endGuest: endGuestSession,
    startGuest: startGuestMode,
  })
}

input.addEventListener('input', render)
input.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing) return
  if (composerEnterAction({ isMobile: mobileComposer, shiftKey: event.shiftKey }) === 'newline') return
  event.preventDefault()
  if (!submit.disabled) form.requestSubmit()
})
callButton.addEventListener('click', () => void callSession?.startOutgoing())
notificationButton.addEventListener('click', async () => {
  const registration = callPushRegistration
  if (!registration || notificationActionPending || rootMode !== 'user2') return
  callSession?.prepareAlertAudioFromUserGesture()
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

authAction.addEventListener('click', async () => {
  if (authActionPending) return
  if (rootMode === 'guest') {
    loginPanel.hidden = !loginPanel.hidden
    loginError.textContent = ''
    if (!loginPanel.hidden) loginInput.focus()
    return
  }

  authActionPending = true
  render()
  try {
    stopUser2Capabilities()
    stopChatRuntime()
    await logoutUser2({
      async endUser2Session() {
        const result = await userSupabase.rpc('chat_end_user_session')
        if (result.error) throw result.error
      },
      async signOutUser2() {
        const result = await userSupabase.auth.signOut()
        if (result.error) throw result.error
      },
    })
    clearGuestLocalState()
    window.location.reload()
  } catch {
    authActionPending = false
    status.textContent = 'Không thể đăng xuất'
    render()
  }
})

loginCancel.addEventListener('click', () => {
  loginPanel.hidden = true
  loginError.textContent = ''
})

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (authActionPending) return
  authActionPending = true
  loginSubmit.disabled = true
  loginError.textContent = ''
  render()

  try {
    await loginUser2({
      endGuestSession,
      async signInUser2(email, password) {
        const result = await userSupabase.auth.signInWithPassword({ email, password })
        if (result.error) throw result.error
      },
    }, loginInput.value, passwordInput.value)
    window.location.reload()
  } catch (error) {
    authActionPending = false
    loginSubmit.disabled = false
    passwordInput.value = ''
    loginError.textContent = error instanceof Error && error.message === 'admin_uses_admin_page'
      ? 'Admin đăng nhập tại /admin/.'
      : 'Tài khoản hoặc mật khẩu không đúng.'
    await startGuestMode()
    render()
  }
})

subscribeChatRuntime(() => {
  if (rootMode === 'user2') {
    startUser2Capabilities()
    void setupCallPushRegistration()
  }
  render()
})
subscribeChatMessages(render)
setupViewportController()
installNotificationContextResponder(() => getChatMessageState().conversationId || null)
render()

void bootRootMode().catch((error) => {
  console.error('Could not start root user mode', error)
  status.textContent = 'Không thể kết nối'
  render()
})
