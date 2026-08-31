import { bootstrapAdminIdentity } from './admin/bootstrap'
import { signInAdmin } from './admin/auth'
import { getAdminState, subscribeAdminState } from './admin/store'
import { clearAdminSelection, selectAdminConversation, sendAdminText, startAdminRuntime } from './admin/runtime'
import { getChatMessageState, subscribeChatMessages } from './chat/message-runtime'
import { getDeviceLabel, getDevicePlatform, getOrCreateDeviceKey } from './device/identity'
import { createSupabaseChatBackend } from './supabase/chat-backend'
import { adminSupabase } from './supabase/client'
import './admin.css'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('Missing #app root')

async function ensureAdminIdentity(): Promise<void> {
  await bootstrapAdminIdentity(createSupabaseChatBackend(adminSupabase), {
    deviceKey: getOrCreateDeviceKey(),
    label: getDeviceLabel(),
    platform: getDevicePlatform(),
  })
}

function mountLogin(message = ''): void {
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

function mountWorkspace(): void {
  root.innerHTML = `
    <main class="admin-app">
      <aside class="admin-inbox">
        <header><strong>Hỗ trợ</strong><button id="logout" type="button">Thoát</button></header>
        <div id="inbox"></div>
      </aside>
      <section class="admin-chat">
        <header><button id="back" type="button">‹</button><strong id="customer">Chọn User</strong></header>
        <div id="admin-messages" class="messages"><p class="empty">Chọn một User để chat.</p></div>
        <form id="admin-composer" class="composer">
          <input id="admin-text" autocomplete="off" placeholder="Nhập tin nhắn…" aria-label="Tin nhắn" />
          <button type="submit">Gửi</button>
        </form>
      </section>
    </main>
  `

  const inbox = root.querySelector<HTMLElement>('#inbox')!
  const messages = root.querySelector<HTMLElement>('#admin-messages')!
  const customer = root.querySelector<HTMLElement>('#customer')!
  const form = root.querySelector<HTMLFormElement>('#admin-composer')!
  const input = root.querySelector<HTMLInputElement>('#admin-text')!
  const send = form.querySelector<HTMLButtonElement>('button')!
  const back = root.querySelector<HTMLButtonElement>('#back')!
  const logout = root.querySelector<HTMLButtonElement>('#logout')!

  function render(): void {
    const state = getAdminState()
    const messageState = getChatMessageState()

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

    customer.textContent = state.detail?.displayName?.trim() || (state.selectedConversationId ? 'User' : 'Chọn User')
    input.disabled = !state.selectedConversationId
    send.disabled = !state.selectedConversationId || !input.value.trim()
    back.disabled = !state.selectedConversationId

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

  input.addEventListener('input', render)
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
    await adminSupabase.auth.signOut()
    mountLogin()
  })

  subscribeAdminState(render)
  subscribeChatMessages(render)
  render()
}

async function bootWorkspace(): Promise<void> {
  try {
    await ensureAdminIdentity()
    mountWorkspace()
    await startAdminRuntime()
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

void start()
