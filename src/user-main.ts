import { mountVoiceCallUi } from './call/ui'
import { VoiceCallSession, type VoiceCallContext } from './call/voice-session'
import { getChatMessageState, subscribeChatMessages } from './chat/message-runtime'
import { sendSupportText, startChatRuntime, stopChatRuntime } from './chat/runtime'
import { getChatRuntimeState, subscribeChatRuntime } from './chat/store'
import { getOrCreateDeviceKey } from './device/identity'
import { CallPushRegistration, callPushBrowserForRegistration } from './notifications/call-push-registration'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  createCacheNotificationPreferencesStorage,
  loadNotificationPreferences,
  notificationDeliveryOptions,
  saveNotificationPreferences,
  type NotificationPreferences,
  type NotificationPreferencesStorage,
} from './notifications/preferences'
import { clearCurrentPushSubscription, pushCleanupBrowserForRegistration } from './notifications/push-cleanup'
import { notificationButtonPresentation } from './notifications/presentation'
import { installNotificationContextResponder } from './notifications/window-context'
import { setupPwa } from './pwa'
import { guestSupabase, userSupabase } from './supabase/client'
import { changeUser2Password, loginUser2, logoutUser2 } from './user/auth'
import { capabilitiesForRootMode } from './user/capabilities'
import { clearGuestLocalState, endGuestSession as teardownGuestSession } from './user/guest-lifecycle'
import { enterFreshGuest, resolveRootMode, type RootUserMode } from './user/root-session'
import { installEdgeDrawerGesture } from './ui/edge-drawer'
import { setButtonIcon } from './ui/icons'
import { mountConversationSurface } from './ui/chat/surface'
import { setupViewportController } from './viewport/controller'
import './call/call.css'
import './ui/chat/surface.css'
import './user.css'

const rootElement = document.querySelector<HTMLDivElement>('#app')
if (!rootElement) throw new Error('Missing #app root')
const root: HTMLDivElement = rootElement
const userPwaRegistrationPromise = setupPwa('user')

root.innerHTML = `
  <main class="user-app">
    <header class="user-header">
      <button id="user-menu" class="user-header-icon" type="button"></button>
      <div class="user-title">
        <strong>Admin hỗ trợ</strong>
        <small id="status">Đang kết nối…</small>
      </div>
      <button id="voice-call" class="user-header-icon chat-call-button" type="button" hidden></button>
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
    <section id="messages" class="chat-messages" aria-label="Tin nhắn với Admin"></section>
    <div id="composer" class="chat-composer"></div>
  </main>

  <div id="user-drawer" class="user-drawer" data-open="false" aria-hidden="true">
    <button id="drawer-backdrop" class="user-drawer-backdrop" type="button" aria-label="Đóng menu"></button>
    <aside class="user-drawer-panel" aria-label="Tài khoản và cài đặt">
      <header>
        <strong>Tài khoản</strong>
        <button id="drawer-close" class="user-header-icon" type="button"></button>
      </header>
      <div class="user-account-summary">
        <span>Trạng thái</span>
        <strong id="user-mode">Vãng lai</strong>
      </div>
      <section id="user2-settings" class="user-settings" hidden>
        <h2>Thông báo</h2>
        <label class="user-setting-row">
          <span>Tin nhắn</span>
          <input id="notification-chat" type="checkbox" />
        </label>
        <label class="user-setting-row">
          <span>Cuộc gọi</span>
          <input id="notification-call" type="checkbox" />
        </label>
        <label class="user-setting-row">
          <span>Âm thanh</span>
          <select id="notification-sound" aria-label="Âm thanh thông báo">
            <option value="system">Theo hệ thống</option>
            <option value="silent">Im lặng</option>
          </select>
        </label>
        <label class="user-setting-row">
          <span>Rung</span>
          <input id="notification-vibrate" type="checkbox" />
        </label>
        <button id="call-notifications" class="user-drawer-action" type="button" hidden>Bật thông báo</button>
        <p id="settings-status" class="user-settings-status" aria-live="polite"></p>
        <details class="user-password-details">
          <summary>Đổi mật khẩu</summary>
          <form id="password-change-form" class="user-password-form">
            <input id="new-password" type="password" autocomplete="new-password" minlength="6" placeholder="Mật khẩu mới" aria-label="Mật khẩu mới" />
            <input id="confirm-password" type="password" autocomplete="new-password" minlength="6" placeholder="Nhập lại mật khẩu" aria-label="Nhập lại mật khẩu" />
            <button type="submit">Đổi mật khẩu</button>
          </form>
        </details>
      </section>
      <button id="auth-action" class="user-drawer-action" type="button">Đăng nhập / Nâng cấp</button>
    </aside>
  </div>

  <div id="voice-call-host"></div>
`

const messages = root.querySelector<HTMLElement>('#messages')!
const composerHost = root.querySelector<HTMLElement>('#composer')!
const status = root.querySelector<HTMLElement>('#status')!
const modeLabel = root.querySelector<HTMLElement>('#user-mode')!
const callButton = root.querySelector<HTMLButtonElement>('#voice-call')!
const menuButton = root.querySelector<HTMLButtonElement>('#user-menu')!
const drawer = root.querySelector<HTMLElement>('#user-drawer')!
const drawerClose = root.querySelector<HTMLButtonElement>('#drawer-close')!
const drawerBackdrop = root.querySelector<HTMLButtonElement>('#drawer-backdrop')!
const settingsPanel = root.querySelector<HTMLElement>('#user2-settings')!
const notificationButton = root.querySelector<HTMLButtonElement>('#call-notifications')!
const notificationChat = root.querySelector<HTMLInputElement>('#notification-chat')!
const notificationCall = root.querySelector<HTMLInputElement>('#notification-call')!
const notificationSound = root.querySelector<HTMLSelectElement>('#notification-sound')!
const notificationVibrate = root.querySelector<HTMLInputElement>('#notification-vibrate')!
const settingsStatus = root.querySelector<HTMLElement>('#settings-status')!
const passwordChangeForm = root.querySelector<HTMLFormElement>('#password-change-form')!
const newPasswordInput = root.querySelector<HTMLInputElement>('#new-password')!
const confirmPasswordInput = root.querySelector<HTMLInputElement>('#confirm-password')!
const authAction = root.querySelector<HTMLButtonElement>('#auth-action')!
const loginPanel = root.querySelector<HTMLElement>('#login-panel')!
const loginForm = root.querySelector<HTMLFormElement>('#user-login-form')!
const loginInput = root.querySelector<HTMLInputElement>('#user-login')!
const passwordInput = root.querySelector<HTMLInputElement>('#user-password')!
const loginSubmit = loginForm.querySelector<HTMLButtonElement>('button[type="submit"]')!
const loginCancel = root.querySelector<HTMLButtonElement>('#login-cancel')!
const loginError = root.querySelector<HTMLElement>('#login-error')!
const callHost = root.querySelector<HTMLElement>('#voice-call-host')!

setButtonIcon(menuButton, 'menu', 'Mở menu')
setButtonIcon(callButton, 'call', 'Gọi thoại')
setButtonIcon(drawerClose, 'close', 'Đóng menu')

let rootMode: RootUserMode = 'guest'
let callSession: VoiceCallSession | null = null
let disposeCallUi: (() => void) | null = null
let disposeCallState: (() => void) | null = null
let callPushRegistration: CallPushRegistration | null = null
let callPushDeviceId = ''
let disposeCallPushState: (() => void) | null = null
let notificationActionPending = false
let authActionPending = false
let settingsActionPending = false
let drawerOpen = false
let notificationPreferences: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES }
let notificationPreferencesStorage: NotificationPreferencesStorage | null = null

const conversationSurface = mountConversationSurface({
  messagesHost: messages,
  composerHost,
  async onSend(text) {
    try {
      await sendSupportText(text)
    } catch (error) {
      status.textContent = 'Gửi thất bại'
      throw error
    }
  },
})

function setDrawerOpen(open: boolean): void {
  drawerOpen = open
  drawer.dataset.open = open ? 'true' : 'false'
  drawer.setAttribute('aria-hidden', open ? 'false' : 'true')
}

installEdgeDrawerGesture(document, {
  isOpen: () => drawerOpen,
  onOpen: () => setDrawerOpen(true),
  onClose: () => setDrawerOpen(false),
})

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

async function setupNotificationPreferences(): Promise<void> {
  if (notificationPreferencesStorage) return
  const registration = await userPwaRegistrationPromise
  if (!registration) return
  notificationPreferencesStorage = createCacheNotificationPreferencesStorage(registration.scope)
  notificationPreferences = await loadNotificationPreferences(notificationPreferencesStorage)
}

async function persistNotificationPreferences(next: NotificationPreferences): Promise<void> {
  if (rootMode !== 'user2' || !notificationPreferencesStorage || settingsActionPending) return
  const previous = notificationPreferences
  notificationPreferences = next
  settingsActionPending = true
  settingsStatus.textContent = 'Đang lưu…'
  renderAccountSettings()
  try {
    await saveNotificationPreferences(notificationPreferencesStorage, next)
    settingsStatus.textContent = 'Đã lưu'
  } catch {
    notificationPreferences = previous
    settingsStatus.textContent = 'Không thể lưu cài đặt'
  } finally {
    settingsActionPending = false
    renderAccountSettings()
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

function renderAccountSettings(): void {
  settingsPanel.hidden = rootMode !== 'user2'
  if (settingsPanel.hidden) return

  notificationChat.checked = notificationPreferences.chat
  notificationCall.checked = notificationPreferences.call
  notificationSound.value = notificationPreferences.sound
  notificationVibrate.checked = notificationPreferences.vibrate

  const disabled = settingsActionPending || !notificationPreferencesStorage
  notificationChat.disabled = disabled
  notificationCall.disabled = disabled
  notificationSound.disabled = disabled
  notificationVibrate.disabled = disabled
  newPasswordInput.disabled = settingsActionPending
  confirmPasswordInput.disabled = settingsActionPending
  const submit = passwordChangeForm.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (submit) submit.disabled = settingsActionPending
}

function render(): void {
  const chat = getChatRuntimeState()
  const messageState = getChatMessageState()
  const canSend = chat.phase === 'ready' && messageState.realtime !== 'error' && Boolean(messageState.conversationId)
  const capabilities = capabilitiesForRootMode(rootMode)
  const callState = callSession?.getState()

  modeLabel.textContent = rootMode === 'user2' ? 'User 2' : 'User 1 · Vãng lai'
  authAction.textContent = rootMode === 'user2' ? 'Đăng xuất' : 'Đăng nhập / Nâng cấp User 2'
  authAction.disabled = authActionPending
  callButton.hidden = !capabilities.call
  callButton.disabled = !capabilities.call || !currentCallContext() || !callState || callState.phase !== 'idle'

  status.textContent = chat.phase === 'error'
    ? 'Không thể kết nối'
    : messageState.realtime === 'subscribed'
      ? 'Đang hoạt động'
      : 'Đang kết nối…'

  renderNotificationButton()
  renderAccountSettings()
  conversationSurface.render({
    messages: messageState.messages,
    currentProfileId: currentProfileId() || null,
    canSend,
    emptyText: chat.phase === 'error' ? 'Không thể tải cuộc trò chuyện.' : 'Bạn cần hỗ trợ gì?',
  })
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
  await setupNotificationPreferences()
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

menuButton.addEventListener('click', () => setDrawerOpen(true))
drawerClose.addEventListener('click', () => setDrawerOpen(false))
drawerBackdrop.addEventListener('click', () => setDrawerOpen(false))
callButton.addEventListener('click', () => void callSession?.startOutgoing())

notificationChat.addEventListener('change', () => {
  void persistNotificationPreferences({ ...notificationPreferences, chat: notificationChat.checked })
})
notificationCall.addEventListener('change', () => {
  void persistNotificationPreferences({ ...notificationPreferences, call: notificationCall.checked })
})
notificationSound.addEventListener('change', () => {
  void persistNotificationPreferences({
    ...notificationPreferences,
    sound: notificationSound.value === 'silent' ? 'silent' : 'system',
  })
})
notificationVibrate.addEventListener('change', () => {
  void persistNotificationPreferences({ ...notificationPreferences, vibrate: notificationVibrate.checked })
})

notificationButton.addEventListener('click', async () => {
  const registration = callPushRegistration
  if (!registration || notificationActionPending || rootMode !== 'user2') return
  callSession?.prepareAlertAudioFromUserGesture()
  notificationActionPending = true
  renderNotificationButton()
  try {
    if (registration.getState() === 'enabled') {
      await registration.testFromUserGesture(notificationDeliveryOptions('incoming_call', notificationPreferences))
    } else {
      await registration.enableFromUserGesture()
    }
  } finally {
    notificationActionPending = false
    renderNotificationButton()
  }
})

passwordChangeForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (rootMode !== 'user2' || settingsActionPending) return
  settingsActionPending = true
  settingsStatus.textContent = 'Đang đổi mật khẩu…'
  renderAccountSettings()
  try {
    await changeUser2Password({
      async updatePassword(password) {
        const result = await userSupabase.auth.updateUser({ password })
        if (result.error) throw result.error
      },
    }, newPasswordInput.value, confirmPasswordInput.value)
    newPasswordInput.value = ''
    confirmPasswordInput.value = ''
    settingsStatus.textContent = 'Đã đổi mật khẩu'
  } catch (error) {
    settingsStatus.textContent = error instanceof Error && error.message === 'password_mismatch'
      ? 'Mật khẩu nhập lại không khớp'
      : error instanceof Error && error.message === 'password_too_short'
        ? 'Mật khẩu cần ít nhất 6 ký tự'
        : 'Không thể đổi mật khẩu'
  } finally {
    settingsActionPending = false
    renderAccountSettings()
  }
})

authAction.addEventListener('click', async () => {
  if (authActionPending) return
  setDrawerOpen(false)
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
