import { clearAdminSelection, refreshAdminInbox, selectAdminConversation } from './runtime'
import { getAdminState, subscribeAdminState, type AdminState } from './store'
import type { AdminInboxItem, AdminSupportDetail } from './contracts'
import {
  createUser2WithDisplayNameFromAdmin,
  deleteUserFromAdmin,
  resetUser2PasswordFromAdmin,
  updateUser2FromAdmin,
  upgradeGuestFromAdmin,
} from './user2-account'
import { adminSupabase } from '../supabase/client'

export type AdminInboxFilter = 'all' | 'user2' | 'guest' | 'unread'

export function filterAdminInbox(items: AdminInboxItem[], filter: AdminInboxFilter, query = ''): AdminInboxItem[] {
  const filtered = filter === 'user2'
    ? items.filter((item) => item.userLevel === 2)
    : filter === 'guest'
      ? items.filter((item) => item.userLevel === 1)
      : filter === 'unread'
        ? items.filter((item) => item.unreadCount > 0)
        : items

  const normalizedQuery = query.trim().toLocaleLowerCase('vi-VN')
  if (!normalizedQuery) return filtered
  return filtered.filter((item) => {
    const displayName = item.displayName?.toLocaleLowerCase('vi-VN') ?? ''
    const username = item.username?.toLocaleLowerCase('vi-VN') ?? ''
    return displayName.includes(normalizedQuery) || username.includes(normalizedQuery)
  })
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatAdminInboxTime(value: string | null, now = new Date()): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((today - day) / 86_400_000)
  if (days <= 0) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (days === 1) return 'Hôm qua'
  if (days < 7) {
    const weekday = date.getDay()
    return weekday === 0 ? 'CN' : `Th ${weekday + 1}`
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`
}

function inboxPreview(item: AdminInboxItem): string {
  const text = item.lastMessageText?.trim()
  if (text) return text
  if (item.lastMessageType === 'audio') return 'Tin nhắn thoại'
  if (item.lastMessageType === 'image') return 'Hình ảnh'
  if (item.lastMessageType === 'file') return 'Tệp đính kèm'
  if (item.lastMessageType === 'call') return 'Cuộc gọi thoại'
  return 'Chưa có tin nhắn'
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  return `${first}${last}`.toUpperCase()
}

function adminErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/username_taken|username_exists|username_reserved/.test(message)) return 'Tài khoản đã được sử dụng.'
  if (/invalid_username|reserved_username/.test(message)) return 'Tài khoản dùng 3–24 ký tự: a-z, 0-9, _.'
  if (/invalid_display_name/.test(message)) return 'Tên hiển thị chưa hợp lệ.'
  if (/password|invalid_password/.test(message)) return 'Mật khẩu cần ít nhất 6 ký tự.'
  if (/guest_required/.test(message)) return 'User này không còn là vãng lai.'
  if (/user2_required/.test(message)) return 'Thao tác này chỉ dành cho User 2.'
  if (/user_not_found/.test(message)) return 'User không còn tồn tại.'
  return 'Không thể thực hiện thao tác.'
}

async function invokeAdminAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await adminSupabase.functions.invoke('taphoaxyz-admin-user', { body })
  if (result.error) {
    const context = (result.error as { context?: unknown }).context
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown }
        if (typeof payload.error === 'string') throw new Error(payload.error)
      } catch (error) {
        if (error instanceof Error && error.message !== 'Unexpected end of JSON input') throw error
      }
    }
    throw result.error
  }
  const data = result.data
  return data && typeof data === 'object' ? data as Record<string, unknown> : {}
}

async function refreshSelected(conversationId: string | null): Promise<void> {
  await refreshAdminInbox()
  if (conversationId) await selectAdminConversation(conversationId)
}

function countFor(items: AdminInboxItem[], filter: AdminInboxFilter): number {
  return filterAdminInbox(items, filter).length
}

function makeInboxRow(item: AdminInboxItem): HTMLButtonElement {
  const name = item.displayName?.trim() || `User ${item.profileId.slice(0, 6)}`
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'admin-inbox-row'
  button.dataset.conversationId = item.conversationId
  button.innerHTML = `
    <span class="admin-inbox-avatar" aria-hidden="true">${initials(name)}</span>
    <span class="admin-inbox-body">
      <span class="admin-inbox-name-line">
        <strong></strong>
        <em class="admin-role-badge">${item.userLevel === 2 ? 'U2' : 'Khách'}</em>
      </span>
      <small></small>
    </span>
    <span class="admin-inbox-meta">
      <time>${formatAdminInboxTime(item.lastMessageAt)}</time>
      ${item.unreadCount > 0 ? `<b class="admin-unread-badge">${item.unreadCount > 99 ? '99+' : item.unreadCount}</b>` : '<span class="admin-unread-spacer"></span>'}
    </span>
  `
  button.querySelector('strong')!.textContent = name
  button.querySelector('.admin-inbox-body small')!.textContent = inboxPreview(item)
  button.addEventListener('click', () => void selectAdminConversation(item.conversationId))
  return button
}

function createSearchBar(): HTMLElement {
  const element = document.createElement('label')
  element.className = 'admin-inbox-search'
  element.innerHTML = '<span class="sr-only">Tìm User</span><input type="search" autocomplete="off" placeholder="Tìm tên hoặc tài khoản…" aria-label="Tìm User theo tên hoặc tài khoản" />'
  return element
}

function createFilterBar(): HTMLElement {
  const element = document.createElement('nav')
  element.className = 'admin-inbox-filters'
  element.setAttribute('aria-label', 'Lọc User')
  element.innerHTML = `
    <button type="button" data-filter="all">Tất cả <span></span></button>
    <button type="button" data-filter="user2">User 2 <span></span></button>
    <button type="button" data-filter="guest">Vãng lai <span></span></button>
    <button type="button" data-filter="unread">Chưa đọc <span></span></button>
  `
  return element
}

function createNewUserPanel(): HTMLElement {
  const element = document.createElement('section')
  element.className = 'admin-managed-create'
  element.hidden = true
  element.innerHTML = `
    <form class="admin-managed-form" id="admin-managed-create-form">
      <input id="admin-create-display" autocomplete="name" maxlength="50" placeholder="Tên hiển thị" aria-label="Tên hiển thị" />
      <input id="admin-create-username" autocomplete="off" maxlength="24" placeholder="Tài khoản" aria-label="Tài khoản User 2" />
      <input id="admin-create-password" type="password" autocomplete="new-password" minlength="6" maxlength="128" placeholder="Mật khẩu" aria-label="Mật khẩu User 2" />
      <div class="admin-managed-form-actions">
        <button type="submit">Tạo User 2</button>
        <button type="button" data-cancel>Tắt</button>
      </div>
      <p class="admin-managed-status" aria-live="polite"></p>
    </form>
  `
  return element
}

function detailRole(detail: AdminSupportDetail): string {
  return detail.userLevel === 2 ? 'User 2' : 'Vãng lai'
}

function renderManagementPanel(panel: HTMLElement, state: AdminState): void {
  const detail = state.detail
  if (!detail) {
    panel.hidden = true
    panel.replaceChildren()
    return
  }

  const wasOpen = panel.querySelector('details')?.hasAttribute('open') ?? false
  panel.hidden = false
  panel.innerHTML = `
    <details class="admin-user-manage-details" ${wasOpen ? 'open' : ''}>
      <summary>
        <span>Quản lý User</span>
        <em>${detailRole(detail)}${detail.username ? ` · @${detail.username}` : ''}</em>
      </summary>
      <div class="admin-user-manage-content">
        ${detail.userLevel === 1 ? `
          <form id="admin-upgrade-form" class="admin-managed-form">
            <h3>Nâng lên User 2</h3>
            <input id="admin-upgrade-display" maxlength="50" value="" placeholder="Tên hiển thị" aria-label="Tên hiển thị" />
            <input id="admin-upgrade-username" maxlength="24" placeholder="Tài khoản" aria-label="Tài khoản User 2" />
            <input id="admin-upgrade-password" type="password" minlength="6" maxlength="128" autocomplete="new-password" placeholder="Mật khẩu" aria-label="Mật khẩu User 2" />
            <button type="submit">Nâng lên User 2</button>
          </form>
        ` : `
          <form id="admin-edit-user2-form" class="admin-managed-form">
            <h3>Thông tin User 2</h3>
            <input id="admin-edit-display" maxlength="50" value="" placeholder="Tên hiển thị" aria-label="Tên hiển thị" />
            <input id="admin-edit-username" maxlength="24" value="" placeholder="Tài khoản" aria-label="Tài khoản User 2" />
            <button type="submit">Lưu thay đổi</button>
          </form>
          <form id="admin-reset-password-form" class="admin-managed-form compact">
            <h3>Đặt lại mật khẩu</h3>
            <input id="admin-reset-password" type="password" minlength="6" maxlength="128" autocomplete="new-password" placeholder="Mật khẩu mới" aria-label="Mật khẩu mới" />
            <input id="admin-reset-confirm" type="password" minlength="6" maxlength="128" autocomplete="new-password" placeholder="Nhập lại mật khẩu" aria-label="Nhập lại mật khẩu" />
            <button type="submit">Đặt lại mật khẩu</button>
          </form>
        `}
        <button id="admin-delete-user" class="admin-delete-user" type="button">Xóa User</button>
        <p class="admin-managed-status" aria-live="polite"></p>
      </div>
    </details>
  `

  const status = panel.querySelector<HTMLElement>('.admin-managed-status')!
  const deleteButton = panel.querySelector<HTMLButtonElement>('#admin-delete-user')!

  if (detail.userLevel === 1) {
    const form = panel.querySelector<HTMLFormElement>('#admin-upgrade-form')!
    const display = panel.querySelector<HTMLInputElement>('#admin-upgrade-display')!
    const username = panel.querySelector<HTMLInputElement>('#admin-upgrade-username')!
    const password = panel.querySelector<HTMLInputElement>('#admin-upgrade-password')!
    display.value = detail.displayName?.trim() || ''
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
      submit.disabled = true
      status.textContent = 'Đang nâng cấp…'
      try {
        await upgradeGuestFromAdmin({
          async upgrade(input) {
            const data = await invokeAdminAction({ action: 'upgrade_guest', ...input })
            return { username: typeof data.username === 'string' ? data.username : input.username }
          },
        }, detail.profileId, display.value, username.value, password.value)
        status.textContent = 'Đã nâng thành User 2.'
        await refreshSelected(detail.conversationId)
      } catch (error) {
        status.textContent = adminErrorMessage(error)
        submit.disabled = false
      }
    })
  } else {
    const editForm = panel.querySelector<HTMLFormElement>('#admin-edit-user2-form')!
    const display = panel.querySelector<HTMLInputElement>('#admin-edit-display')!
    const username = panel.querySelector<HTMLInputElement>('#admin-edit-username')!
    display.value = detail.displayName?.trim() || ''
    username.value = detail.username?.trim() || ''
    editForm.addEventListener('submit', async (event) => {
      event.preventDefault()
      const submit = editForm.querySelector<HTMLButtonElement>('button[type="submit"]')!
      submit.disabled = true
      status.textContent = 'Đang lưu…'
      try {
        await updateUser2FromAdmin({
          async update(input) {
            const data = await invokeAdminAction({ action: 'update_user2', ...input })
            return { username: typeof data.username === 'string' ? data.username : input.username }
          },
        }, detail.profileId, display.value, username.value)
        status.textContent = 'Đã lưu.'
        await refreshSelected(detail.conversationId)
      } catch (error) {
        status.textContent = adminErrorMessage(error)
        submit.disabled = false
      }
    })

    const resetForm = panel.querySelector<HTMLFormElement>('#admin-reset-password-form')!
    const password = panel.querySelector<HTMLInputElement>('#admin-reset-password')!
    const confirmation = panel.querySelector<HTMLInputElement>('#admin-reset-confirm')!
    resetForm.addEventListener('submit', async (event) => {
      event.preventDefault()
      const submit = resetForm.querySelector<HTMLButtonElement>('button[type="submit"]')!
      submit.disabled = true
      status.textContent = 'Đang đặt lại mật khẩu…'
      try {
        await resetUser2PasswordFromAdmin({
          async resetPassword(input) {
            await invokeAdminAction({ action: 'reset_password', ...input })
          },
        }, detail.profileId, password.value, confirmation.value)
        password.value = ''
        confirmation.value = ''
        status.textContent = 'Đã đặt lại mật khẩu.'
        submit.disabled = false
      } catch (error) {
        status.textContent = error instanceof Error && error.message === 'password_mismatch'
          ? 'Mật khẩu nhập lại không khớp.'
          : adminErrorMessage(error)
        submit.disabled = false
      }
    })
  }

  deleteButton.addEventListener('click', async () => {
    if (!window.confirm(`Xóa ${detail.displayName?.trim() || 'User'}? Lịch sử chat vẫn được giữ lại.`)) return
    deleteButton.disabled = true
    status.textContent = 'Đang xóa User…'
    try {
      await deleteUserFromAdmin({
        async deleteUser(profileId) {
          await invokeAdminAction({ action: 'delete_user', profileId })
        },
      }, detail.profileId)
      clearAdminSelection()
      await refreshAdminInbox()
    } catch (error) {
      status.textContent = adminErrorMessage(error)
      deleteButton.disabled = false
    }
  })
}

function attachWorkspace(app: HTMLElement): () => void {
  const inboxHost = app.querySelector<HTMLElement>('#inbox')
  const inboxPane = app.querySelector<HTMLElement>('.admin-inbox')
  const chatHeader = app.querySelector<HTMLElement>('.admin-chat > header')
  const headerActions = app.querySelector<HTMLElement>('.admin-header-actions')
  if (!inboxHost || !inboxPane || !chatHeader || !headerActions) return () => undefined
  const inboxElement: HTMLElement = inboxHost

  const createButton = document.createElement('button')
  createButton.type = 'button'
  createButton.className = 'admin-managed-create-toggle'
  createButton.textContent = 'Tạo User 2'
  headerActions.insertBefore(createButton, headerActions.firstChild)

  const createPanel = createNewUserPanel()
  inboxPane.insertBefore(createPanel, inboxElement)
  const searchBar = createSearchBar()
  inboxPane.insertBefore(searchBar, inboxElement)
  const searchInput = searchBar.querySelector<HTMLInputElement>('input')!
  const filterBar = createFilterBar()
  inboxPane.insertBefore(filterBar, inboxElement)

  const managementPanel = document.createElement('section')
  managementPanel.className = 'admin-user-management'
  managementPanel.hidden = true
  chatHeader.insertAdjacentElement('afterend', managementPanel)

  let activeFilter: AdminInboxFilter = 'all'
  let searchQuery = ''

  function renderFilters(items: AdminInboxItem[]): void {
    for (const button of filterBar.querySelectorAll<HTMLButtonElement>('button[data-filter]')) {
      const filter = button.dataset.filter as AdminInboxFilter
      button.dataset.active = filter === activeFilter ? 'true' : 'false'
      const count = button.querySelector<HTMLElement>('span')!
      count.textContent = String(countFor(items, filter))
    }
  }

  function renderInbox(): void {
    const state = getAdminState()
    renderFilters(state.inbox)
    const rows = filterAdminInbox(state.inbox, activeFilter, searchQuery)
    const children = rows.map((item) => {
      const row = makeInboxRow(item)
      if (item.conversationId === state.selectedConversationId) row.dataset.active = 'true'
      return row
    })
    if (children.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'empty admin-filter-empty'
      empty.textContent = searchQuery.trim()
        ? 'Không tìm thấy User.'
        : activeFilter === 'all'
          ? 'Chưa có User.'
          : 'Không có User trong nhóm này.'
      inboxElement.replaceChildren(empty)
    } else {
      inboxElement.replaceChildren(...children)
    }
    renderManagementPanel(managementPanel, state)
  }

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value
    renderInbox()
  })

  for (const button of filterBar.querySelectorAll<HTMLButtonElement>('button[data-filter]')) {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter as AdminInboxFilter
      renderInbox()
    })
  }

  createButton.addEventListener('click', () => {
    createPanel.hidden = !createPanel.hidden
    createPanel.querySelector<HTMLElement>('.admin-managed-status')!.textContent = ''
    if (!createPanel.hidden) createPanel.querySelector<HTMLInputElement>('#admin-create-display')?.focus()
  })
  createPanel.querySelector<HTMLButtonElement>('[data-cancel]')!.addEventListener('click', () => {
    createPanel.hidden = true
  })

  const createForm = createPanel.querySelector<HTMLFormElement>('#admin-managed-create-form')!
  const createDisplay = createPanel.querySelector<HTMLInputElement>('#admin-create-display')!
  const createUsername = createPanel.querySelector<HTMLInputElement>('#admin-create-username')!
  const createPassword = createPanel.querySelector<HTMLInputElement>('#admin-create-password')!
  const createStatus = createPanel.querySelector<HTMLElement>('.admin-managed-status')!
  createForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const submit = createForm.querySelector<HTMLButtonElement>('button[type="submit"]')!
    submit.disabled = true
    createStatus.textContent = 'Đang tạo…'
    try {
      const created = await createUser2WithDisplayNameFromAdmin({
        async create(input) {
          const data = await invokeAdminAction({ action: 'create_user2', ...input })
          return {
            displayName: typeof data.displayName === 'string' ? data.displayName : input.displayName,
            username: typeof data.username === 'string' ? data.username : input.username,
          }
        },
      }, createDisplay.value, createUsername.value, createPassword.value)
      createStatus.textContent = `Đã tạo ${created.displayName}.`
      createDisplay.value = ''
      createUsername.value = ''
      createPassword.value = ''
      await refreshAdminInbox()
      submit.disabled = false
    } catch (error) {
      createStatus.textContent = adminErrorMessage(error)
      submit.disabled = false
    }
  })

  const stopState = subscribeAdminState(() => {
    queueMicrotask(renderInbox)
  })
  queueMicrotask(renderInbox)

  return () => {
    stopState()
    createButton.remove()
    createPanel.remove()
    searchBar.remove()
    filterBar.remove()
    managementPanel.remove()
  }
}

export function mountAdminManagementUi(root: HTMLElement = document.body): () => void {
  let activeApp: HTMLElement | null = null
  let cleanup: (() => void) | null = null

  function sync(): void {
    const next = root.querySelector<HTMLElement>('.admin-app')
    if (next === activeApp) return
    cleanup?.()
    cleanup = null
    activeApp = next
    if (next) cleanup = attachWorkspace(next)
  }

  const observer = new MutationObserver(sync)
  observer.observe(root, { childList: true, subtree: true })
  sync()

  return () => {
    observer.disconnect()
    cleanup?.()
  }
}
