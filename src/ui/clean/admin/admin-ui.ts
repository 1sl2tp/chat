import type { AdminInboxItem } from '../../../admin/contracts'
import './admin.css'

export interface CleanAdminWorkspace {
  root: HTMLElement
  inboxScreen: HTMLElement
  chatScreen: HTMLElement
  chatHost: HTMLElement
  list: HTMLElement
  search: HTMLInputElement
  notificationButton: HTMLButtonElement
  logoutButton: HTMLButtonElement
  createUserButton: HTMLButtonElement
  callHost: HTMLElement
  diagnostic: HTMLElement
  manageSheet: HTMLElement
  manageTitle: HTMLElement
  manageBody: HTMLElement
  manageClose: HTMLButtonElement
  showInbox(): void
  showChat(): void
  setManageOpen(open: boolean): void
  renderInbox(items: AdminInboxItem[], onSelect: (id: string) => void): void
}

function initials(value: string): string {
  return value.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || 'U'
}

function timeLabel(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

export function createCleanAdminWorkspace(root: HTMLElement): CleanAdminWorkspace {
  root.innerHTML = `
    <main class="clean-admin" data-clean-app="admin">
      <section id="clean-admin-inbox-screen" class="clean-admin__screen">
        <header class="clean-admin__top">
          <div class="clean-admin__brand">
            <div class="clean-admin__logo">💬</div>
            <div><strong>TAPHOA</strong><span>Hỗ trợ</span></div>
          </div>
          <div class="clean-admin__actions">
            <button id="clean-admin-notification" class="clean-admin__button" type="button" hidden>Bật thông báo</button>
            <button id="clean-admin-logout" class="clean-admin__button" type="button">Thoát</button>
          </div>
        </header>
        <div class="clean-admin__inbox-head">
          <div class="clean-admin__inbox-title">
            <h1>Hộp thư hỗ trợ</h1>
            <button id="clean-admin-create-user" class="clean-admin__button clean-admin__button--primary" type="button">Tạo User 2</button>
          </div>
          <input id="clean-admin-search" class="clean-admin__search" placeholder="Tìm kiếm" autocomplete="off">
        </div>
        <div id="clean-admin-list" class="clean-admin__list clean-scrollbar"></div>
      </section>
      <section id="clean-admin-chat-screen" class="clean-admin__screen" hidden>
        <div id="clean-admin-chat" class="clean-admin__chat"></div>
      </section>
    </main>

    <div id="clean-admin-manage-sheet" class="clean-admin-manage-sheet" data-open="false" aria-hidden="true">
      <button class="clean-admin-manage-sheet__backdrop" type="button" aria-label="Đóng quản lý User"></button>
      <aside class="clean-admin-manage-sheet__panel" aria-label="Quản lý User">
        <header class="clean-admin-manage-sheet__head">
          <strong id="clean-admin-manage-title">Quản lý User</strong>
          <button id="clean-admin-manage-close" type="button" aria-label="Đóng">×</button>
        </header>
        <div id="clean-admin-manage-body" class="clean-admin-manage-sheet__body clean-scrollbar"></div>
      </aside>
    </div>

    <div id="clean-admin-call"></div>
    <span id="clean-admin-diagnostic" class="clean-diagnostic"></span>
  `

  const $ = <T extends Element>(selector: string): T => {
    const el = root.querySelector<T>(selector)
    if (!el) throw new Error(`Missing ${selector}`)
    return el
  }
  const inboxScreen = $('#clean-admin-inbox-screen') as HTMLElement
  const chatScreen = $('#clean-admin-chat-screen') as HTMLElement
  const list = $('#clean-admin-list') as HTMLElement
  const search = $('#clean-admin-search') as HTMLInputElement
  const manageSheet = $('#clean-admin-manage-sheet') as HTMLElement
  const manageBackdrop = manageSheet.querySelector<HTMLButtonElement>('.clean-admin-manage-sheet__backdrop')!
  const manageClose = $('#clean-admin-manage-close') as HTMLButtonElement
  let currentItems: AdminInboxItem[] = []
  let currentSelect: (id: string) => void = () => {}

  const paint = () => {
    const q = search.value.trim().toLowerCase()
    const items = currentItems.filter(item => !q || `${item.displayName ?? ''} ${item.username ?? ''} ${item.lastMessageText ?? ''}`.toLowerCase().includes(q))
    list.replaceChildren()
    if (!items.length) {
      const empty = document.createElement('div')
      empty.className = 'clean-admin__empty'
      empty.textContent = 'Không có User.'
      list.append(empty)
      return
    }
    for (const item of items) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'clean-admin__row'
      const avatar = document.createElement('div')
      avatar.className = 'clean-admin__avatar'
      avatar.textContent = initials(item.displayName || item.username || 'User')
      const main = document.createElement('div')
      main.className = 'clean-admin__row-main'
      const line = document.createElement('div')
      line.className = 'clean-admin__row-line'
      const name = document.createElement('div')
      name.className = 'clean-admin__row-name'
      name.textContent = item.displayName || item.username || 'User'
      const time = document.createElement('span')
      time.className = 'clean-admin__time'
      time.textContent = timeLabel(item.lastMessageAt)
      const preview = document.createElement('div')
      preview.className = 'clean-admin__preview'
      preview.textContent = item.lastMessageText || 'Chưa có tin nhắn'
      line.append(name, time)
      main.append(line, preview)
      if (item.unreadCount > 0) {
        const badge = document.createElement('span')
        badge.className = 'clean-admin__badge'
        badge.textContent = String(item.unreadCount)
        main.append(badge)
      }
      button.append(avatar, main)
      button.addEventListener('click', () => currentSelect(item.conversationId))
      list.append(button)
    }
  }

  const setManageOpen = (open: boolean) => {
    manageSheet.dataset.open = open ? 'true' : 'false'
    manageSheet.setAttribute('aria-hidden', open ? 'false' : 'true')
  }

  search.addEventListener('input', paint)
  manageBackdrop.addEventListener('click', () => setManageOpen(false))
  manageClose.addEventListener('click', () => setManageOpen(false))

  return {
    root,
    inboxScreen,
    chatScreen,
    chatHost: $('#clean-admin-chat') as HTMLElement,
    list,
    search,
    notificationButton: $('#clean-admin-notification') as HTMLButtonElement,
    logoutButton: $('#clean-admin-logout') as HTMLButtonElement,
    createUserButton: $('#clean-admin-create-user') as HTMLButtonElement,
    callHost: $('#clean-admin-call') as HTMLElement,
    diagnostic: $('#clean-admin-diagnostic') as HTMLElement,
    manageSheet,
    manageTitle: $('#clean-admin-manage-title') as HTMLElement,
    manageBody: $('#clean-admin-manage-body') as HTMLElement,
    manageClose,
    showInbox() { inboxScreen.hidden = false; chatScreen.hidden = true },
    showChat() { inboxScreen.hidden = true; chatScreen.hidden = false },
    setManageOpen,
    renderInbox(items, onSelect) { currentItems = items; currentSelect = onSelect; paint() },
  }
}

export interface CleanAdminLogin {
  login: HTMLInputElement
  password: HTMLInputElement
  button: HTMLButtonElement
  error: HTMLElement
  form: HTMLFormElement
}

export function createCleanAdminLogin(root: HTMLElement, message = ''): CleanAdminLogin {
  root.innerHTML = `
    <main class="clean-admin-login clean-auth">
      <form id="clean-admin-login-form">
        <div class="clean-admin-login__logo">💬</div>
        <h1>Đăng nhập</h1>
        <label>Tài khoản<input id="clean-admin-login" value="admin" autocomplete="username"></label>
        <label>Mật khẩu<input id="clean-admin-password" type="password" autocomplete="current-password"></label>
        <p id="clean-admin-login-error">${message}</p>
        <button type="submit">Đăng nhập</button>
      </form>
    </main>
  `
  const form = root.querySelector<HTMLFormElement>('#clean-admin-login-form')!
  return {
    form,
    login: root.querySelector<HTMLInputElement>('#clean-admin-login')!,
    password: root.querySelector<HTMLInputElement>('#clean-admin-password')!,
    button: form.querySelector<HTMLButtonElement>('button')!,
    error: root.querySelector<HTMLElement>('#clean-admin-login-error')!,
  }
}
