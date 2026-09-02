export interface InboxUserRow {
  id: string
  kind: 'user1' | 'user2'
  displayName: string
  username?: string
  preview?: string
  timestamp?: string
}

export interface InboxModel {
  user2: InboxUserRow[]
  user1: InboxUserRow[]
}

export interface InboxMountOptions {
  host: HTMLElement
  model: InboxModel
  onSelect(id: string): void
}

export interface InboxView {
  element: HTMLElement
  update(model: InboxModel): void
  setSearchQuery(query: string): void
  getSearchQuery(): string
  setScrollTop(value: number): void
  getScrollTop(): number
  select(id: string): void
  destroy(): void
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('vi-VN')
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('vi-VN')
  return `${parts[0]![0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toLocaleUpperCase('vi-VN')
}

function matches(row: InboxUserRow, query: string): boolean {
  const q = normalized(query)
  if (!q) return true
  return [row.displayName, row.username ?? '', row.preview ?? '']
    .some(value => normalized(value).includes(q))
}

function createRow(row: InboxUserRow, onSelect: (id: string) => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'cw-inbox__row w-full p-3 bg-slate-900/70 border border-slate-800 rounded-2xl flex items-start space-x-3 active:bg-slate-800 transition cursor-pointer text-left text-slate-100'
  button.dataset.conversationId = row.id
  button.dataset.kind = row.kind
  button.addEventListener('click', () => onSelect(row.id))

  const avatarWrap = document.createElement('span')
  avatarWrap.className = 'cw-inbox__avatar-wrap relative shrink-0'
  const avatar = document.createElement('span')
  avatar.className = row.kind === 'user2'
    ? 'cw-inbox__avatar w-10 h-10 rounded-full bg-cw-500/20 text-cw-400 border border-cw-500/30 font-bold flex items-center justify-center text-xs'
    : 'cw-inbox__avatar w-10 h-10 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center text-xs'
  avatar.textContent = initials(row.displayName)
  avatarWrap.append(avatar)

  const body = document.createElement('span')
  body.className = 'cw-inbox__row-copy flex-1 min-w-0'

  const nameLine = document.createElement('span')
  nameLine.className = 'cw-inbox__name-line flex items-center justify-between gap-2 mb-0.5 min-w-0'
  const name = document.createElement('strong')
  name.className = 'text-xs font-bold text-white truncate min-w-0'
  name.textContent = row.displayName
  const time = document.createElement('time')
  time.className = 'text-[10px] text-slate-500 font-mono shrink-0'
  time.textContent = row.timestamp ?? ''
  nameLine.append(name, time)

  const identityLine = document.createElement('span')
  identityLine.className = 'cw-inbox__identity-line flex min-w-0'
  const identity = document.createElement('small')
  identity.className = row.kind === 'user2'
    ? 'cw-inbox__identity text-[10px] text-cw-400 truncate'
    : 'cw-inbox__identity text-[10px] text-slate-500 truncate'
  identity.textContent = row.username ? `@${row.username}` : (row.kind === 'user2' ? 'User 2' : 'Vãng lai')
  identityLine.append(identity)

  const previewLine = document.createElement('span')
  previewLine.className = 'cw-inbox__preview-line flex min-w-0 mt-1'
  const preview = document.createElement('small')
  preview.className = 'cw-inbox__preview text-[11px] text-slate-400 truncate min-w-0'
  preview.textContent = row.preview ?? ''
  previewLine.append(preview)

  body.append(nameLine, identityLine, previewLine)
  button.append(avatarWrap, body)
  return button
}

function createSection(
  label: 'USER 2' | 'USER 1',
  rows: InboxUserRow[],
  query: string,
  onSelect: (id: string) => void,
): HTMLElement {
  const section = document.createElement('section')
  section.className = 'cw-inbox__section space-y-2'
  section.dataset.kind = label === 'USER 2' ? 'user2' : 'user1'

  const title = document.createElement('h2')
  title.className = 'cw-inbox__section-title px-1 pt-1 text-[10px] font-bold tracking-[0.08em] text-slate-500'
  title.textContent = label
  section.append(title)

  const visibleRows = rows.filter(row => matches(row, query))
  if (visibleRows.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'cw-inbox__empty m-0 px-2 py-3 text-xs text-slate-600'
    empty.textContent = 'Không có User.'
    section.append(empty)
    return section
  }

  for (const row of visibleRows) section.append(createRow(row, onSelect))
  return section
}

export function mountInbox(options: InboxMountOptions): InboxView {
  const root = document.createElement('section')
  root.className = 'cw-inbox h-full min-h-0 flex flex-col bg-slate-950 text-slate-100'

  const search = document.createElement('input')
  search.type = 'search'
  search.className = 'cw-inbox__search mx-3 mt-3 mb-2 min-h-10 rounded-xl bg-slate-900 border border-slate-800 px-3 text-sm text-white placeholder-slate-500 outline-none focus:border-cw-500 focus:ring-2 focus:ring-cw-500/10'
  search.placeholder = 'Tìm kiếm'
  search.setAttribute('aria-label', 'Tìm User')

  const list = document.createElement('div')
  list.className = 'cw-inbox__list flex-1 min-h-0 overflow-y-auto p-3 pt-1 space-y-4 custom-scrollbar'

  root.append(search, list)
  options.host.replaceChildren(root)

  let model = options.model
  let query = ''

  const render = () => {
    const previousScrollTop = list.scrollTop
    list.replaceChildren(
      createSection('USER 2', model.user2, query, options.onSelect),
      createSection('USER 1', model.user1, query, options.onSelect),
    )
    list.scrollTop = previousScrollTop
  }

  search.addEventListener('input', () => {
    query = search.value
    render()
  })

  render()

  return {
    element: root,
    update(nextModel) {
      model = nextModel
      render()
    },
    setSearchQuery(nextQuery) {
      query = nextQuery
      search.value = nextQuery
      render()
    },
    getSearchQuery() {
      return query
    },
    setScrollTop(value) {
      list.scrollTop = value
    },
    getScrollTop() {
      return list.scrollTop
    },
    select(id) {
      options.onSelect(id)
    },
    destroy() {
      options.host.replaceChildren()
    },
  }
}
