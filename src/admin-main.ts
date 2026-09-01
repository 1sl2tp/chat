import { bootstrapAdminIdentity } from './admin/bootstrap'
import { signInAdmin } from './admin/auth'
import { getAdminState, subscribeAdminState } from './admin/store'
import { clearAdminSelection, selectAdminConversation, sendAdminText, startAdminRuntime } from './admin/runtime'
import { createUser2FromAdmin } from './admin/user2-account'
import { mountVoiceCallUi } from './call/ui'
import { VoiceCallSession, type VoiceCallContext } from './call/voice-session'
import { getChatMessageState, subscribeChatMessages } from './chat/message-runtime'
import { getDeviceLabel, getDevicePlatform, getOrCreateDeviceKey } from './device/identity'
import { CallPushRegistration, callPushBrowserForRegistration } from './notifications/call-push-registration'
import { notificationButtonPresentation } from './notifications/presentation'
import { installNotificationContextResponder } from './notifications/window-context'
import { setupPwa } from './pwa'
import { createSupabaseChatBackend } from './supabase/chat-backend'
import { adminSupabase } from './supabase/client'
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
        <h1>Admin</h1>
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
      error.textContent = 'Không đăng nhập được Admin.'
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
            <button id="create-user2-toggle" type="button">Tạo User</button>
            <button id="logout" type="button">Thoát</button>
          </div>
        </header>
        <section id="create-user2-panel" class="admin-user2-panel" hidden>
          <form id="create-user2-form">
            <input id="create-user2-username" autocomplete="off" placeholder="Tài khoản User" aria-label="Tài khoản User" />
            <input id="create-user2-password" type="password" autocomplete="new-password" placeholder="Mật khẩu" aria-label="Mật khẩu User" />
            <div class="admin-user2-actions">
              <button type="submit">Tạo</button>
              <button id="create-user2-cancel" type="button">Hủy</button>
            </div>
            <p id="create-user2-result" aria-live="polite"></p>
          </form>
        </section>
        <div id="inbox"></div>
      </aside>
      <section class="admin-chat">
        <header>
          <button id="back" type="button">‹</button>
          <strong id="customer">Chọn User</strong>
          <button id="call-notifications" class="call-notification-button" type="button" hidden>Bật thông báo</button>
          <button id="admin-voice-call" class="chat-call-button" type="button" aria-label="Gọi thoại">☎</button>
        </header>
        <div id="admin-messages" class="messages"><p class="empty">Chọn một User để chat.</p></div>
        <form id="admin-composer" class="composer">
          <input id="admin-text" autocomplete="off" placeholder="Nhập tin nhắn…" aria-label="Tin nhắn" />
          <button type="submit">Gửi</button>
        </form>
      </section>
    </main>
    <div id="voice-call-host"></div>
  `

  const adminApp = root.querySelector<HTMLElement>('.admin-app')!
  const inbox = root.querySelector<HTMLElement>('#inbox')!
  const messages = root.querySelector<HTMLElement>('#admin-messages')!
  const customer = root.querySelector<HTMLElement>('#customer')!
  const form = root.querySelector<HTMLFormElement>('#admin-composer')!
  const input = root.querySelector<HTMLInputElement>('#admin-text')!
  const send = form.querySelector<HTMLButtonElement>('button')!
  const back = root.querySelector<HTMLButtonElement>('#back')!
  const logout = root.querySelector<HTMLButtonElement>('#logout')!
  const createUserToggle = root.querySelector<HTMLButtonElement>('#create-user2-toggle')!
  const createUserPanel = root.querySelector<HTMLElement>('#create-user2-panel')!
  const createUserForm = root.querySelector<HTMLFormElement>('#create-user2-form')!
  const createUserInput = root.querySelector<HTMLInputElement>('#create-user2-username')!
  const createUserPassword = root.querySelector<HTMLInputElement>('#create-user2-password')!
  const createUserSubmit = createUserForm.querySelector<HTMLButtonElement>('button[type="submit"]')!
  const createUserCancel = root.querySelector<HTMLButtonElement>('#create-user2-cancel')!
  const createUserResult = root.querySelector<HTMLElement>('#create-user2-result')!
  const callButton = root.querySelector<HTMLButtonElement>('#admin-voice-call')!
  const notificationButton = root.querySelector<HTMLButtonElement>('#call-notifications')!
  const callHost = root.querySelector<HTMLElement>('#voice-call-host')!
  let notificationActionPending = false

  callSession?.dispose()
  disposeCallUi?.()
  clearCallPushRegistration()
  callSession = new VoiceCallSession(adminSupabase, currentAdminCallContext)
  disposeCallUi = mountVoiceCallUi(callHost, callSession)
  callSession.start()

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

    adminApp.dataset.selected = state.selectedConversationId ? 'true' : 'false'
    inbox.replaceChildren(...state.inbox.map((item) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'inbox-item'
      if (item.conversationId === state.selectedConversationId) button.classList.add('active')
      const name = item.displayName?.trim() || `User ${item.profileId.slice(0, 6)}`
      const preview = item.lastMessageText?.trim() || 'Chưa có tin nhắn'
      button.textContent = item.unreadCount > 0 ? `${name} (${item.unreadCount}) — ${preview}` : `${name} — ${preview}`
      button.addEventListener('click', () => void selectAdminConversation(item.conversationId))
      return button
    }))

    if (state.inbox.length === 0 && state.phase === 'ready') {
      const empty = document.createElement('p')
      empty.className = 'empty'
      empty.textContent = 'Chưa có User.'
      inbox.replaceChildren(empty)
    }

    renderNotificationButton()
    customer.textContent = state.detail?.displayName?.trim() || (state.selectedConversationId ? 'User' : 'Chọn User')
    input.disabled = !state.selectedConversationId
    send.disabled = !state.selectedConversationId || !input.value.trim()
    back.disabled = !state.selectedConversationId
    callButton.disabled = !state.selectedConversationId || !callState || callState.phase !== 'idle'

    if (!state.selectedConversationId) {
      messages.innerHTML = '<p class="empty">Chọn một User để chat.</p>'
      return
    }

    if (messageState.messages.length === 0) {
      messages.innerHTML = '<p class="empty">Chưa có tin nhắn.</p>'
      return
    }

    const customerProfileId = state.detail?.profileId ?? ''
    messages.replaceChildren(...messageState.messages.map((message) => {
      const row = document.createElement('div')
      row.className = message.sender_id === customerProfileId ? 'msg' : 'msg mine'
      row.textContent = message.revoked_at ? 'Tin nhắn đã được thu hồi' : message.text ?? ''
      return row
    }))
    messages.scrollTop = messages.scrollHeight
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

  createUserToggle.addEventListener('click', () => {
    createUserPanel.hidden = !createUserPanel.hidden
    createUserResult.textContent = ''
    if (!createUserPanel.hidden) createUserInput.focus()
  })
  createUserCancel.addEventListener('click', () => {
    createUserPanel.hidden = true
    createUserResult.textContent = ''
    createUserPassword.value = ''
  })
  createUserForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    createUserSubmit.disabled = true
    createUserResult.textContent = ''
    try {
      const result = await createUser2FromAdmin({
        async create(account) {
          const invoked = await adminSupabase.functions.invoke('taphoaxyz-admin-user', {
            body: { action: 'create_user2', ...account },
          })
          if (invoked.error) throw invoked.error
          const data = invoked.data as { username?: unknown } | null
          if (typeof data?.username !== 'string') throw new Error('invalid_create_user2_response')
          return { username: data.username }
        },
      }, createUserInput.value, createUserPassword.value)
      createUserResult.textContent = `Đã tạo ${result.username}`
      createUserInput.value = ''
      createUserPassword.value = ''
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      createUserResult.textContent = message === 'reserved_username'
        ? 'Không dùng tên admin.'
        : message === 'invalid_username'
          ? 'Tài khoản 3–24 ký tự: a-z, 0-9, _.'
          : message === 'password_too_short'
            ? 'Mật khẩu tối thiểu 6 ký tự.'
            : 'Không tạo được User.'
    } finally {
      createUserSubmit.disabled = false
    }
  })

  input.addEventListener('input', render)
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
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    render()
    try {
      await sendAdminText(text)
    } catch {
      input.value = text
      render()
    }
  })
  back.addEventListener('click', clearAdminSelection)
  logout.addEventListener('click', async () => {
    callSession?.dispose()
    clearCallPushRegistration()
    await adminSupabase.auth.signOut()
    mountLogin()
  })

  subscribeAdminState(render)
  subscribeChatMessages(render)
  callSession.subscribe(render)
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
        // Keep the normal Admin workspace usable for a stale/unavailable notification.
      }
    }
  } catch {
    await adminSupabase.auth.signOut()
    mountLogin('Phiên Admin không hợp lệ.')
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

installNotificationContextResponder(() => getAdminState().selectedConversationId || null)
void start()
