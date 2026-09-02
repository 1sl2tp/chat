import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminInboxItem } from '../../../admin/contracts'
import { toInboxModel } from '../../../admin/chatwoot-inbox-adapter'
import { mountInbox, type InboxModel } from './inbox'
import inboxCss from './inbox.css?raw'

class FakeElement {
  readonly tagName: string
  className = ''
  textContent: string | null = null
  value = ''
  type = ''
  placeholder = ''
  hidden = false
  scrollTop = 0
  dataset: Record<string, string> = {}
  children: FakeElement[] = []
  private listeners = new Map<string, Array<() => void>>()

  constructor(tag: string) { this.tagName = tag.toUpperCase() }
  append(...nodes: FakeElement[]) { this.children.push(...nodes) }
  replaceChildren(...nodes: FakeElement[]) { this.children = [...nodes] }
  addEventListener(type: string, listener: () => void) {
    const current = this.listeners.get(type) ?? []
    current.push(listener)
    this.listeners.set(type, current)
  }
  setAttribute() {}
  remove() {}
  focus() {}
  click() { for (const listener of this.listeners.get('click') ?? []) listener() }
  input() { for (const listener of this.listeners.get('input') ?? []) listener() }
}

function textTree(root: FakeElement): string {
  return [root.textContent ?? '', ...root.children.map(textTree)].join(' ')
}

function sampleModel(): InboxModel {
  return {
    user2: [{ id: 'c-u2', kind: 'user2', displayName: 'An', username: 'an', preview: 'Xin chào', timestamp: '12:30' }],
    user1: [{ id: 'c-u1', kind: 'user1', displayName: 'Bình', preview: 'Cần hỗ trợ', timestamp: '12:20' }],
  }
}

function adminItem(userLevel: number): AdminInboxItem {
  return {
    conversationId: userLevel === 2 ? 'c-u2' : 'c-u1',
    profileId: userLevel === 2 ? 'p-u2' : 'p-u1',
    displayName: userLevel === 2 ? 'An' : 'Bình',
    username: userLevel === 2 ? 'an' : null,
    userLevel,
    identityType: 'user',
    address: null,
    customerLastSeenAt: null,
    lastMessageAt: '2026-09-02T12:30:00.000Z',
    lastMessageText: 'Xin chào',
    lastMessageType: 'text',
    unreadCount: 0,
  }
}

describe('Chatwoot Hỗ trợ Inbox', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: (tag: string) => new FakeElement(tag) },
    })
  })
  afterEach(() => Reflect.deleteProperty(globalThis, 'document'))

  it('renders Search then USER 2 then USER 1 without legacy default filter chips', () => {
    const host = new FakeElement('div')
    const view = mountInbox({ host: host as unknown as HTMLElement, model: sampleModel(), onSelect: () => undefined })
    const root = view.element as unknown as FakeElement
    const text = textTree(root)

    expect(root.children[0]?.tagName).toBe('INPUT')
    expect(root.children[1]?.children[0]?.textContent).toBe('USER 2')
    expect(root.children[1]?.children[1]?.textContent).toBe('USER 1')
    expect(text).not.toContain('Tất cả')
    expect(text).not.toContain('Chưa đọc')
  })

  it('keeps section headers in document flow so they cannot overlay the first row', () => {
    expect(inboxCss).toMatch(/\.cw-inbox__section-title\s*\{[^}]*position:\s*static/s)
    expect(inboxCss).not.toMatch(/\.cw-inbox__section-title\s*\{[^}]*(?:absolute|fixed|sticky)/s)
  })

  it('keeps search and scroll state when selecting a row and returning to the Inbox', () => {
    const selected = vi.fn()
    const host = new FakeElement('div')
    const view = mountInbox({ host: host as unknown as HTMLElement, model: sampleModel(), onSelect: selected })

    view.setSearchQuery('an')
    view.setScrollTop(96)
    view.select('c-u2')
    expect(selected).toHaveBeenCalledWith('c-u2')

    view.update(sampleModel())
    expect(view.getSearchQuery()).toBe('an')
    expect(view.getScrollTop()).toBe(96)
  })

  it('adapts Admin runtime rows into USER 2 and USER 1 sections', () => {
    const model = toInboxModel([adminItem(1), adminItem(2)], new Date('2026-09-02T13:00:00.000Z'))
    expect(model.user2.map(row => row.id)).toEqual(['c-u2'])
    expect(model.user1.map(row => row.id)).toEqual(['c-u1'])
    expect(model.user2[0]?.username).toBe('an')
  })
})
