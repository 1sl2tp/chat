import { bootstrapAdminIdentity } from './admin/bootstrap'
import { signInAdmin } from './admin/auth'
import { clearAdminSelection, selectAdminConversation, startAdminRuntime } from './admin/runtime'
import { logoutAdmin } from './admin/session'
import { getAdminState, subscribeAdminState } from './admin/store'
import { mountVoiceCallUi } from './call/ui'
import { VoiceCallSession, type VoiceCallContext } from './call/voice-session'
import { VoiceRecorderSession } from './chat/attachments/voice-recorder'
import { getChatMessageState, subscribeChatMessages } from './chat/message-runtime'
import { toConversationActionsAdapter, toConversationViewModel } from './chat/ui/chatwoot-adapter'
import { getDeviceLabel, getDevicePlatform, getOrCreateDeviceKey } from './device/identity'
import { CallPushRegistration, callPushBrowserForRegistration } from './notifications/call-push-registration'
import { notificationButtonPresentation } from './notifications/presentation'
import { clearCurrentPushSubscription, pushCleanupBrowserForRegistration } from './notifications/push-cleanup'
import { installNotificationContextResponder } from './notifications/window-context'
import { setupPwa } from './pwa'
import { createSupabaseChatBackend } from './supabase/chat-backend'
import { adminSupabase } from './supabase/client'
import { getConversationCapabilities } from './ui/chat/capabilities'
import { mountConversationScreen, type MountedConversationScreen } from './ui/chatwoot-port/conversation-screen'
import { installEdgeDrawerGesture } from './ui/edge-drawer'
import { setButtonIcon } from './ui/icons'
import { setupViewportController } from './viewport/controller'
import './call/call.css'
import './admin.css'

const rootElement = document.querySelector<HTMLDivElement>('#app')
if (!rootElement) throw new Error('Missing #app root')
const root: HTMLDivElement = rootElement
const adminPwaRegistrationPromise = setupPwa('admin')

let adminIdentity: unknown = null
let callSession: VoiceCallSession | null = null
let disposeCallUi: (() => void) | null = null
let callPushRegistration: CallPushRegistration | null = null
let disposeCallPushState: (() => void) | null = null

async function ensureAdminIdentity(): Promise<unknown> {
  adminIdentity = await bootstrapAdminIdentity(createSupabaseChatBackend(adminSupabase), {
    deviceKey: getOrCreateDeviceKey(),
    label: getDeviceLabel(),
    platform: getDevicePlatform(),
  })
  return adminIdentity
}

function currentAdminProfileId(): string {
  if (!adminIdentity || typeof adminIdentity !== 'object') return ''
  const profile = (adminIdentity as { profile?: unknown }).profile
  if (!profile || typeof profile !== 'object') return ''
  return String((profile as { id?: unknown }).id ?? '')
}

function currentAdminCallContext(): VoiceCallContext | null {
  if (!adminIdentity || typeof adminIdentity !== 'object') return null
  const identity = adminIdentity as { profile?: unknown; device_id?: unknown }
  const profile = identity.profile && typeof identity.profile === 'object'
    ? identity.profile as { id?: unknown }
    : null
  const profileId = String(profile?.id ?? '')
  const deviceId = String(identity.device_id ?? '')
  if (!profileId || !deviceId) return null

  const state = getAdminState()
  return {
    profileId,
    deviceId,
    conversationId: state.selectedConversationId || null,
    peerName: state.detail?.displayName?.trim() || 'User',
  }
}

function clearCallPushRegistration(): void {
  disposeCallPushState?.()
  disposeCallPushState = null
  callPushRegistration = null
}

function mountLogin(message = ''): void {
  callSession?.dispose()
  callSession = null
  disposeCallUi?.()
  disposeCallUi = null
  clearCallPushRegistration()
  root.innerHTML = `
    <main class="admin-login">
      <form id="admin-login-form">
        <h1>Hỗ trợ</h1>
        <input id="admin-login" value="admin" autocomplete="username" aria-label="Tài khoản" />
        <input id="admin-password" type="password" autocomplete="current-password" placeholder="Mật khẩu" aria-label="Mật khẩu" />
        <button type="submit">Đăng nhập</button>
        <p id="admin-login-error">${message}</p>
      </form>
    </main>
  `

  const form = root.querySelector<HTMLFormElement>('#admin-login-form')!
  const login = root.querySelector<HTMLInputElement>('#admin-login')!
  const password = root.querySelector<HTMLInputElement>('#admin-password')!
  const button = form.querySelector<HTMLButtonElement>('button')!
  const error = root.querySelector<HTMLElement>('#admin-login-error')!

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    button.disabled = true
    error.textContent = ''
    try {
      await signInAdmin({
        async signIn(email, value) {
          const result = await adminSupabase.auth.signInWithPassword({ email, password: value })
          if (result.error) throw result.error
        },
      }, login.value, password.value)
      await bootWorkspace()
    } catch {
      error.textContent = 'Không đăng nhập được Hỗ trợ.'
      button.disabled = false
    }
  })

  password.focus()
}

async function mountWorkspace(): Promise<void> {
  root.innerHTML = `
    <main class="admin-app">
      <aside class="admin-inbox">
        <header>
          <strong>Hỗ trợ</strong>
          <div class="admin-header-actions">
            <button id="logout" type="button">Thoát</button>
          </div>
        </header>
        <div id="inbox"></div>
      </aside>
      <section class="admin-chat">
        <header>
          <button id="back" class="admin-icon-button" type="button"></button>
          <strong id="customer">Chọn User</strong>
          <button id="call-notifications" class="call-notification-button" type="button" hidden>Bật thông báo</button>
          <button id="admin-voice-call" class="admin-icon-button chat-call-button" type="button"></button>
        </header>
        <div id="admin-messages" class="chat-messages" aria-label="Nội dung hội thoại"></div>
        <div id="admin-composer" class="chat-composer"></div>
      </section>
    </main>
    <div id="voice-call-host"></div>
  `

  const adminApp = root.querySelector<HTMLElement>('.admin-app')!
  const messages = root.querySelector<HTMLElement>('#admin-messages')!
  const composerHost = root.querySelector<HTMLElement>('#admin-composer')!
  const customer = root.querySelector<HTMLElement>('#customer')!
  const back = root.querySelector<HTMLButtonElement>('#back')!
  const logout = root.querySelector<HTMLButtonElement>('#logout')!
  const callButton = root.querySelector<HTMLButtonElement>('#admin-voice-call')!
  const notificationButton = root.querySelector<HTMLButtonElement>('#call-notifications')!
  const callHost = root.querySelector<HTMLElement>('#voice-call-host')!
  const legacyChatHeader = root.querySelector<HTMLElement>('.admin-chat > header')!
  const chatwootVoiceRecorder = new VoiceRecorderSession()
  let notificationActionPending = false
  let chatwootConversation: MountedConversationScreen | null = null

  setButtonIcon(back, 'back', 'Danh sách User')
  setButtonIcon(callButton, 'call', 'Gọi thoại')

  callSession?.dispose()
  disposeCallUi?.()
  clearCallPushRegistration()
  callSession = new VoiceCallSession(adminSupabase, currentAdminCallContext)
  disposeCallUi = mountVoiceCallUi(callHost, callSession)
  callSession.start()

  legacyChatHeader.hidden = true
  composerHost.hidden = true
  messages.className = 'chatwoot-conversation-host'
  messages.removeAttribute('aria-label')

  const runtimeActions = {
    get canSend() {
      const state = getAdminState()
      return Boolean(state.selectedConversationId) && getChatMessageState().realtime !== 'error'
    },
    get canAttach() {
      return Boolean(getAdminState().selectedConversationId) && Boolean(getConversationCapabilities())
    },
    get canRecord() {
      return Boolean(getAdminState().selectedConversationId)
        && Boolean(getConversationCapabilities())
        && typeof MediaRecorder !== 'undefined'
        && Boolean(navigator.mediaDevices?.getUserMedia)
    },
    get canCall() {
      const state = getAdminState()
      const callState = callSession?.getState()
      return Boolean(state.selectedConversationId) && callState?.phase === 'idle'
    },
    async sendText(text: string) {
      const { sendAdminText } = await import('./admin/runtime')
      await sendAdminText(text)
    },
    async sendAttachment(file: File) {
      const capabilities = getConversationCapabilities()
      if (!capabilities) throw new Error('attachment_unavailable')
      await capabilities.sendAttachment(file)
    },
    async startVoiceRecording() {
      await chatwootVoiceRecorder.start()
    },
    async stopVoiceRecording() {
      const recording = await chatwootVoiceRecorder.stop()
      const capabilities = getConversationCapabilities()
      if (!capabilities) throw new Error('attachment_unavailable')
      await capabilities.sendAttachment(recording.file)
    },
    async startCall() {
      if (!callSession) throw new Error('call_unavailable')
      await callSession.startOutgoing()
    },
  }
  const actions = toConversationActionsAdapter(runtimeActions)
  chatwootConversation = mountConversationScreen({
    root: messages,
    model: toConversationViewModel({
      actor: 'admin',
      conversationId: null,
      title: 'Chọn User',
      subtitle: 'Hỗ trợ',
      canCall: false,
      messages: [],
      currentProfileId: currentAdminProfileId() || null,
    }),
    actions,
    enabled: false,
    onBack: clearAdminSelection,
    onCall: () => { void actions.startCall().catch(() => {}) },
  })

  const disposeDrawerGesture = installEdgeDrawerGesture(adminApp, {
    isOpen: () => !Boolean(getAdminState().selectedConversationId),
    onOpen: clearAdminSelection,
    onClose: () => undefined,
  })

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
    const state = getAdminState()
    const messageState = getChatMessageState()
    const callState = callSession?.getState()
    const canSend = Boolean(state.selectedConversationId) && messageState.realtime !== 'error'
    const canCall = Boolean(state.selectedConversationId) && callState?.phase === 'idle'

    adminApp.dataset.selected = state.selectedConversationId ? 'true' : 'false'
    renderNotificationButton()
    customer.textContent = state.detail?.displayName?.trim() || (state.selectedConversationId ? 'User' : 'Chọn User')
    back.disabled = !state.selectedConversationId
    callButton.disabled = !canCall

    chatwootConversation?.update(toConversationViewModel({
      actor: 'admin',
      conversationId: state.selectedConversationId || null,
      title: state.detail?.displayName?.trim() || (state.selectedConversationId ? 'User' : 'Chọn User'),
      subtitle: 'Hỗ trợ',
      canCall,
      messages: state.selectedConversationId ? messageState.messages : [],
      currentProfileId: currentAdminProfileId() || null,
    }))
    chatwootConversation?.setEnabled(canSend)
  }

  const deviceId = currentAdminCallContext()?.deviceId ?? ''
  const pwaRegistration = deviceId ? await adminPwaRegistrationPromise : null
  if (deviceId && pwaRegistration) {
    callPushRegistration = new CallPushRegistration(
      adminSupabase,
      deviceId,
      callPushBrowserForRegistration(pwaRegistration),
    )
    disposeCallPushState = callPushRegistration.subscribe(render)
    void callPushRegistration.sync()
  }

  callButton.addEventListener('click', () => void callSession?.startOutgoing())
  notificationButton.addEventListener('click', async () => {
    const registration = callPushRegistration
    if (!registration || notificationActionPending) return
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
  back.addEventListener('click', clearAdminSelection)

  const stopAdminState = subscribeAdminState(render)
  const stopMessages = subscribeChatMessages(render)
  const stopCall = callSession.subscribe(render)

  logout.addEventListener('click', async () => {
    logout.disabled = true
    stopAdminState()
    stopMessages()
    stopCall()
    disposeDrawerGesture()
    chatwootConversation?.destroy()
    callSession?.dispose()
    clearCallPushRegistration()

    await logoutAdmin({
      async unsubscribePush() {
        const registration = await adminPwaRegistrationPromise
        if (!registration) return
        await clearCurrentPushSubscription(pushCleanupBrowserForRegistration(registration))
      },
      async endAdminSession() {
        const result = await adminSupabase.rpc('chat_end_admin_session')
        if (result.error) throw result.error
      },
      async signOutAdmin() {
        const result = await adminSupabase.auth.signOut()
        if (result.error) throw result.error
      },
    })

    mountLogin()
  })

  render()
}

async function bootWorkspace(): Promise<void> {
  try {
    await ensureAdminIdentity()
    await mountWorkspace()
    await startAdminRuntime()

    const requestedConversationId = new URL(window.location.href).searchParams.get('conversation')
    if (requestedConversationId) {
      try {
        await selectAdminConversation(requestedConversationId)
        history.replaceState(null, '', './')
      } catch {
        // Keep the normal Hỗ trợ workspace usable for a stale/unavailable notification.
      }
    }
  } catch {
    await adminSupabase.auth.signOut()
    mountLogin('Phiên Hỗ trợ không hợp lệ.')
  }
}

async function start(): Promise<void> {
  const result = await adminSupabase.auth.getSession()
  if (result.error || !result.data.session) {
    mountLogin()
    return
  }
  await bootWorkspace()
}

setupViewportController()
installNotificationContextResponder(() => getAdminState().selectedConversationId || null)
void start()