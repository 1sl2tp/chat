import { getChatMessageState, subscribeChatMessages } from './chat/message-runtime'
import { sendSupportText, startChatRuntime } from './chat/runtime'
import { getChatRuntimeState, subscribeChatRuntime } from './chat/store'
import { setupPwa } from './pwa'
import { supabase } from './supabase/client'
import { ensureFixedTestUser, TEST_USER_LOGIN } from './user/fixed-auth'
import { setupViewportController } from './viewport/controller'
import './user.css'

const rootElement = document.querySelector<HTMLDivElement>('#app')
if (!rootElement) throw new Error('Missing #app root')
const root: HTMLDivElement = rootElement

root.innerHTML = `
  <main class="user-app">
    <header><strong>Admin hỗ trợ · ${TEST_USER_LOGIN}</strong><span id="status">Đang đăng nhập…</span></header>
    <section id="messages" class="messages"><p class="empty">Bạn cần hỗ trợ gì?</p></section>
    <form id="composer" class="composer">
      <input id="text" autocomplete="off" placeholder="Nhập tin nhắn…" aria-label="Tin nhắn" />
      <button type="submit">Gửi</button>
    </form>
  </main>
`

const messages = root.querySelector<HTMLElement>('#messages')!
const status = root.querySelector<HTMLElement>('#status')!
const form = root.querySelector<HTMLFormElement>('#composer')!
const input = root.querySelector<HTMLInputElement>('#text')!
const submit = form.querySelector<HTMLButtonElement>('button')!

function render(): void {
  const chat = getChatRuntimeState()
  const messageState = getChatMessageState()
  const canSend = chat.phase === 'ready' && messageState.realtime !== 'error' && Boolean(messageState.conversationId)

  status.textContent = chat.phase === 'error'
    ? 'Không thể kết nối'
    : messageState.realtime === 'subscribed'
      ? 'Đang hoạt động'
      : chat.phase === 'ready'
        ? 'Đang kết nối…'
        : 'Đang đăng nhập…'
  input.disabled = !canSend
  submit.disabled = !canSend || !input.value.trim()

  if (messageState.messages.length === 0) {
    messages.innerHTML = '<p class="empty">Bạn cần hỗ trợ gì?</p>'
    return
  }

  const currentProfileId = chat.identity && typeof chat.identity === 'object'
    ? String((chat.identity as { id?: unknown }).id ?? '')
    : ''

  messages.replaceChildren(...messageState.messages.map((message) => {
    const row = document.createElement('div')
    row.className = message.sender_id === currentProfileId ? 'msg mine' : 'msg'
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
    await sendSupportText(text)
  } catch {
    status.textContent = 'Gửi thất bại'
  }
})

subscribeChatRuntime(render)
subscribeChatMessages(render)
setupViewportController()
setupPwa()
render()

async function startFixedUser(): Promise<void> {
  try {
    await ensureFixedTestUser({
      async getCurrentUser() {
        const result = await supabase.auth.getSession()
        if (result.error) throw result.error
        const user = result.data.session?.user
        if (!user) return null
        return {
          email: user.email ?? null,
          isAnonymous: Boolean((user as { is_anonymous?: boolean }).is_anonymous),
        }
      },
      async signOut() {
        const result = await supabase.auth.signOut()
        if (result.error) throw result.error
      },
      async signIn(email, password) {
        const result = await supabase.auth.signInWithPassword({ email, password })
        if (result.error) throw result.error
      },
      async signUp(email, password) {
        const result = await supabase.auth.signUp({ email, password })
        if (result.error) throw result.error
        return Boolean(result.data.session)
      },
    })
    await startChatRuntime()
  } catch (error) {
    status.textContent = 'Không đăng nhập được User test'
    console.error('Fixed test user bootstrap failed', error)
  }
}

void startFixedUser()
