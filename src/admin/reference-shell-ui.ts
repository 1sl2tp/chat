function icon(className: string): HTMLElement {
  const element = document.createElement('i')
  element.className = className
  element.setAttribute('aria-hidden', 'true')
  return element
}

function decorateAdminApp(app: HTMLElement): () => void {
  if (app.dataset.referenceShell === 'true') return () => undefined

  const inbox = app.querySelector<HTMLElement>('.admin-inbox')
  const chat = app.querySelector<HTMLElement>('.admin-chat')
  const inboxHeader = inbox?.querySelector<HTMLElement>('header')
  const notificationButton = app.querySelector<HTMLButtonElement>('#call-notifications')
  const logoutButton = app.querySelector<HTMLButtonElement>('#logout')
  if (!inbox || !chat || !inboxHeader || !notificationButton || !logoutButton) return () => undefined

  app.dataset.referenceShell = 'true'
  app.classList.add('bg-slate-950', 'text-slate-100')
  inboxHeader.querySelector('strong')!.textContent = 'Hộp thư hỗ trợ'

  const topbar = document.createElement('header')
  topbar.className = 'admin-topbar bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-30'

  const brand = document.createElement('div')
  brand.className = 'admin-brand flex items-center gap-3 min-w-0'
  const logo = document.createElement('div')
  logo.className = 'admin-brand__logo w-9 h-9 rounded-xl bg-cw-500 text-white flex items-center justify-center shadow-md shrink-0'
  logo.append(icon('fa-solid fa-comments text-sm'))
  const brandCopy = document.createElement('div')
  brandCopy.className = 'min-w-0'
  const title = document.createElement('strong')
  title.className = 'block text-sm font-bold text-white leading-tight truncate'
  title.textContent = 'TAPHOA'
  const subtitle = document.createElement('span')
  subtitle.className = 'block text-[10px] text-slate-400 truncate'
  subtitle.textContent = 'Tạp Hóa XYZ · Hỗ trợ'
  brandCopy.append(title, subtitle)
  brand.append(logo, brandCopy)

  const topbarActions = document.createElement('div')
  topbarActions.className = 'admin-topbar__actions flex items-center gap-2 shrink-0'

  notificationButton.className = 'call-notification-button admin-notification-control h-9 px-3 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:border-slate-600 text-[11px] font-semibold flex items-center gap-2'

  const account = document.createElement('div')
  account.className = 'admin-account relative'
  const accountToggle = document.createElement('button')
  accountToggle.id = 'admin-account-toggle'
  accountToggle.type = 'button'
  accountToggle.className = 'admin-account-toggle h-9 px-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 flex items-center gap-2 text-left'
  accountToggle.setAttribute('aria-haspopup', 'menu')
  accountToggle.setAttribute('aria-expanded', 'false')
  const avatar = document.createElement('span')
  avatar.className = 'w-7 h-7 rounded-full bg-cw-500 text-white text-[10px] font-bold flex items-center justify-center'
  avatar.textContent = 'HT'
  const accountLabel = document.createElement('span')
  accountLabel.className = 'hidden sm:block text-[11px] font-semibold text-slate-200'
  accountLabel.textContent = 'Hỗ trợ'
  accountToggle.append(avatar, accountLabel, icon('fa-solid fa-chevron-down text-[9px] text-slate-400'))

  const accountMenu = document.createElement('div')
  accountMenu.id = 'admin-account-menu'
  accountMenu.className = 'admin-account-menu absolute right-0 top-[calc(100%+8px)] w-56 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl z-50'
  accountMenu.hidden = true
  accountMenu.setAttribute('role', 'menu')

  const identity = document.createElement('div')
  identity.className = 'px-3 py-2 border-b border-slate-800 mb-1'
  const identityTitle = document.createElement('strong')
  identityTitle.className = 'block text-xs text-white'
  identityTitle.textContent = 'Hỗ trợ TAPHOA'
  const identitySub = document.createElement('span')
  identitySub.className = 'block text-[10px] text-slate-500 mt-0.5'
  identitySub.textContent = 'Tạp Hóa XYZ'
  identity.append(identityTitle, identitySub)

  logoutButton.className = 'admin-account-menu__logout w-full px-3 py-2 rounded-lg bg-transparent hover:bg-slate-800 text-slate-300 hover:text-white text-xs text-left flex items-center gap-2'
  logoutButton.replaceChildren(icon('fa-solid fa-right-from-bracket text-[11px]'), document.createTextNode('Đăng xuất'))
  accountMenu.append(identity, logoutButton)
  account.append(accountToggle, accountMenu)

  topbarActions.append(notificationButton, account)
  topbar.append(brand, topbarActions)

  const workspace = document.createElement('div')
  workspace.className = 'admin-workspace min-h-0 min-w-0 bg-slate-950'
  app.insertBefore(topbar, inbox)
  app.insertBefore(workspace, inbox)
  workspace.append(inbox, chat)

  inbox.classList.add('bg-slate-950', 'border-slate-800')
  chat.classList.add('bg-slate-950')
  inboxHeader.classList.add('bg-slate-900', 'border-slate-800')

  const toggleMenu = (open: boolean) => {
    accountMenu.hidden = !open
    accountToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
  }
  const onToggle = (event: Event) => {
    event.stopPropagation()
    toggleMenu(accountMenu.hidden)
  }
  const onMenuClick = (event: Event) => event.stopPropagation()
  const onDocumentClick = () => toggleMenu(false)
  accountToggle.addEventListener('click', onToggle)
  accountMenu.addEventListener('click', onMenuClick)
  document.addEventListener('click', onDocumentClick)

  return () => {
    accountToggle.removeEventListener('click', onToggle)
    accountMenu.removeEventListener('click', onMenuClick)
    document.removeEventListener('click', onDocumentClick)
  }
}

export function mountAdminReferenceShellUi(root: HTMLElement = document.body): () => void {
  let activeApp: HTMLElement | null = null
  let cleanup: (() => void) | null = null

  const sync = () => {
    const next = root.querySelector<HTMLElement>('.admin-app')
    if (next === activeApp) return
    cleanup?.()
    cleanup = null
    activeApp = next
    if (next) cleanup = decorateAdminApp(next)
  }

  const observer = new MutationObserver(sync)
  observer.observe(root, { childList: true, subtree: true })
  sync()

  return () => {
    observer.disconnect()
    cleanup?.()
  }
}
