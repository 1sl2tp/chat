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
  button.className = 'cw-inbox__row'
  button.dataset.conversationId = row.id
  button.dataset.kind = row.kind
  button.addEventListener('click', () => onSelect(row.id))

  const avatarWrap = document.createElement('span')
  avatarWrap.className = 'cw-inbox__avatar-wrap'
  const avatar = document.createElement('span')
  avatar.className = 'cw-inbox__avatar'
  avatar.textContent = initials(row.displayName)
  avatarWrap.append(avatar)

  const body = document.createElement('span')
  body.className = 'cw-inbox__row-copy'

  const nameLine = document.createElement('span')
  nameLine.className = 'cw-inbox__name-line'
  const name = document.createElement('strong')
  name.textContent = row.displayName
  const time = document.createElement('time')
  time.textContent = row.timestamp ?? ''
  nameLine.append(name, time)

  const identityLine = document.createElement('span')
  identityLine.className = 'cw-inbox__identity-line'
  const identity = document.createElement('small')
  identity.className = 'cw-inbox__identity'
  identity.textContent = row.username ? `@${row.username}` : (row.kind === 'user2' ? 'User 2' : 'User 1')
  identityLine.append(identity)

  const previewLine = document.createElement('span')
  previewLine.className = 'cw-inbox__preview-line'
  const preview = document.createElement('small')
  preview.className = 'cw-inbox__preview'
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
  section.className = 'cw-inbox__section'
  section.dataset.kind = label === 'USER 2' ? 'user2' : 'user1'

  const title = document.createElement('h2')
  title.className = 'cw-inbox__section-title'
  title.textContent = label
  section.append(title)

  const visibleRows = rows.filter(row => matches(row, query))
  if (visibleRows.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'cw-inbox__empty'
    empty.textContent = 'Không có User.'
    section.append(empty)
    return section
  }

  for (const row of visibleRows) section.append(createRow(row, onSelect))
  return section
}

export function mountInbox(options: InboxMountOptions): InboxView {
  const root = document.createElement('section')
  root.className = 'cw-inbox'

  const search = document.createElement('input')
  search.type = 'search'
  search.className = 'cw-inbox__search'
  search.placeholder = 'Tìm kiếm'
  search.setAttribute('aria-label', 'Tìm User')

  const list = document.createElement('div')
  list.className = 'cw-inbox__list'

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
