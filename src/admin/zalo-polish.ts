import type { AdminInboxItem } from './contracts'
import { clearAdminSelection } from './runtime'
import { getAdminState, subscribeAdminState } from './store'
import { installEdgeDrawerGesture } from '../ui/edge-drawer'

export interface AdminInboxGroup {
  key: 'user2' | 'guest'
  label: 'USER 2' | 'USER 1'
  items: AdminInboxItem[]
}

export function groupAdminInbox(items: AdminInboxItem[]): AdminInboxGroup[] {
  const groups: AdminInboxGroup[] = []
  const user2 = items.filter((item) => item.userLevel === 2)
  const guest = items.filter((item) => item.userLevel !== 2)
  if (user2.length) groups.push({ key: 'user2', label: 'USER 2', items: user2 })
  if (guest.length) groups.push({ key: 'guest', label: 'USER 1', items: guest })
  return groups
}

function makeGroupLabel(label: string): HTMLElement {
  const element = document.createElement('div')
  element.className = 'admin-inbox-group-label'
  element.textContent = label
  return element
}

function mountInboxRoleGroups(app: HTMLElement): () => void {
  const inbox = app.querySelector<HTMLElement>('#inbox')
  const filters = app.querySelector<HTMLElement>('.admin-inbox-filters')
  filters?.remove()
  if (!inbox) return () => undefined

  let observer: MutationObserver | null = null
  let scheduled = false

  const decorate = () => {
    scheduled = false
    observer?.disconnect()
    try {
      inbox.querySelectorAll('.admin-inbox-group-label').forEach((node) => node.remove())
      const rows = [...inbox.querySelectorAll<HTMLButtonElement>('.admin-inbox-row')]
      if (rows.length === 0) return

      const byConversation = new Map(getAdminState().inbox.map((item) => [item.conversationId, item]))
      const rowByConversation = new Map(rows.map((row) => [row.dataset.conversationId ?? '', row]))
      const visibleItems = rows
        .map((row) => byConversation.get(row.dataset.conversationId ?? ''))
        .filter((item): item is AdminInboxItem => Boolean(item))

      for (const row of rows) {
        const item = byConversation.get(row.dataset.conversationId ?? '')
        const badge = row.querySelector<HTMLElement>('.admin-role-badge')
        if (item && badge) badge.textContent = item.userLevel === 2 ? 'U2' : 'U1'
      }

      const children: Node[] = []
      for (const group of groupAdminInbox(visibleItems)) {
        children.push(makeGroupLabel(group.label))
        for (const item of group.items) {
          const row = rowByConversation.get(item.conversationId)
          if (row) children.push(row)
        }
      }
      if (children.length) inbox.replaceChildren(...children)
    } finally {
      observer?.observe(inbox, { childList: true })
    }
  }

  const schedule = () => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(decorate)
  }

  observer = new MutationObserver(schedule)
  observer.observe(inbox, { childList: true })
  const stopState = subscribeAdminState(schedule)
  schedule()

  return () => {
    observer?.disconnect()
    stopState()
  }
}

function mountOverflowMenu(app: HTMLElement): () => void {
  const headerActions = app.querySelector<HTMLElement>('.admin-header-actions')
  const logout = app.querySelector<HTMLButtonElement>('#logout')
  const create = app.querySelector<HTMLButtonElement>('.admin-managed-create-toggle')
  if (!headerActions || !logout || !create) return () => undefined

  logout.hidden = true
  create.hidden = true

  const shell = document.createElement('div')
  shell.className = 'admin-overflow-shell'
  shell.dataset.open = 'false'

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'admin-overflow-toggle'
  toggle.textContent = '⋯'
  toggle.setAttribute('aria-label', 'Tùy chọn Hỗ trợ')
  toggle.setAttribute('aria-expanded', 'false')

  const menu = document.createElement('div')
  menu.className = 'admin-overflow-menu'
  menu.setAttribute('role', 'menu')

  const createAction = document.createElement('button')
  createAction.type = 'button'
  createAction.textContent = 'Tạo tài khoản'
  createAction.setAttribute('role', 'menuitem')

  const logoutAction = document.createElement('button')
  logoutAction.type = 'button'
  logoutAction.textContent = 'Đăng xuất'
  logoutAction.setAttribute('role', 'menuitem')

  const setOpen = (open: boolean) => {
    shell.dataset.open = open ? 'true' : 'false'
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
  }

  toggle.addEventListener('click', () => setOpen(shell.dataset.open !== 'true'))
  createAction.addEventListener('click', () => {
    setOpen(false)
    create.click()
  })
  logoutAction.addEventListener('click', () => {
    setOpen(false)
    logout.click()
  })
  menu.append(createAction, logoutAction)
  shell.append(toggle, menu)
  headerActions.append(shell)

  const onPointerDown = (event: PointerEvent) => {
    if (shell.dataset.open === 'true' && event.target instanceof Node && !shell.contains(event.target)) setOpen(false)
  }
  document.addEventListener('pointerdown', onPointerDown)

  return () => {
    document.removeEventListener('pointerdown', onPointerDown)
    shell.remove()
    logout.hidden = false
    create.hidden = false
  }
}

function mountPeerIdentity(app: HTMLElement): () => void {
  const header = app.querySelector<HTMLElement>('.admin-chat > header')
  const title = header?.querySelector<HTMLElement>('#customer')
  if (!header || !title) return () => undefined

  const wrapper = document.createElement('div')
  wrapper.className = 'admin-peer-identity'
  title.insertAdjacentElement('beforebegin', wrapper)
  wrapper.append(title)
  const meta = document.createElement('small')
  meta.className = 'admin-peer-meta'
  wrapper.append(meta)

  const render = () => {
    const detail = getAdminState().detail
    if (!detail) {
      meta.textContent = ''
      return
    }
    meta.textContent = detail.userLevel === 2
      ? `${detail.username ? `@${detail.username} · ` : ''}User 2`
      : 'User 1'
  }
  const stop = subscribeAdminState(render)
  render()

  return () => {
    stop()
    wrapper.insertAdjacentElement('beforebegin', title)
    wrapper.remove()
  }
}

function mountConversationSwipe(app: HTMLElement): () => void {
  const chat = app.querySelector<HTMLElement>('.admin-chat')
  if (!chat) return () => undefined
  return installEdgeDrawerGesture(chat, {
    isOpen: () => !Boolean(getAdminState().selectedConversationId),
    onOpen: clearAdminSelection,
    onClose: () => undefined,
    openEdgePx: Number.POSITIVE_INFINITY,
  })
}

function attach(app: HTMLElement): () => void {
  const cleanups = [
    mountInboxRoleGroups(app),
    mountOverflowMenu(app),
    mountPeerIdentity(app),
    mountConversationSwipe(app),
  ]
  return () => cleanups.reverse().forEach((cleanup) => cleanup())
}

export function mountAdminZaloPolish(root: HTMLElement = document.body): () => void {
  let app: HTMLElement | null = null
  let cleanup: (() => void) | null = null

  const sync = () => {
    const next = root.querySelector<HTMLElement>('.admin-app')
    if (next === app) return
    cleanup?.()
    cleanup = null
    app = next
    if (next) queueMicrotask(() => {
      if (app === next) cleanup = attach(next)
    })
  }

  const observer = new MutationObserver(sync)
  observer.observe(root, { childList: true, subtree: true })
  sync()
  return () => {
    observer.disconnect()
    cleanup?.()
  }
}
