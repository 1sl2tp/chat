import { getChatMessageState, subscribeChatMessages } from './chat/message-runtime'
import { sendSupportText, startChatRuntime } from './chat/runtime'
import { getChatRuntimeState, subscribeChatRuntime } from './chat/store'
import { setupPwa } from './pwa'
import { supabase } from './supabase/client'
import { setupViewportController } from './viewport/controller'
import './user.css'

const rootElement = document.querySelector<HTMLDivElement>('#app')
if (!rootElement) throw new Error('Missing #app root')
const root: HTMLDivElement = rootElement

root.innerHTML = `
  <main class="user-app">
    <header><strong>Admin hỗ trợ · test</strong><span id="status">Đang kết nối…</span></header>
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

function currentProfileId(): string {
  const identity = getChatRuntimeState().identity
  if (!identity || typeof identity !== 'object') return ''
  const profile = (identity as { profile?: unknown }).profile
  if (!profile || typeof profile !== 'object') return ''
  return String((profile as { id?: unknown }).id ?? '')
}

function render(): void {
  const chat = getChatRuntimeState()
  const messageState = getChatMessageState()
  const canSend = chat.phase === 'ready' && messageState.realtime !== 'error' && Boolean(messageState.conversationId)

  status.textContent = chat.phase === 'error'
    ? 'Không thể kết nối'
    : messageState.realtime === 'subscribed'
      ? 'Đang hoạt động'
      : 'Đang kết nối…'

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

async function startTestUser(): Promise<void> {
  await startChatRuntime()
  if (getChatRuntimeState().phase !== 'ready') return

  const result = await supabase.rpc('chat_set_my_test_profile')
  if (result.error) console.warn('Could not label test profile', result.error)
}

void startTestUser()
