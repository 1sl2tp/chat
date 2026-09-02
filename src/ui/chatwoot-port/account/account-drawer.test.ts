import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountAccountDrawer, type AccountDrawerModel } from './account-drawer'

class FakeElement {
  readonly tagName: string
  className = ''
  textContent: string | null = null
  type = ''
  hidden = false
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
  remove() {}
  click() { for (const listener of this.listeners.get('click') ?? []) listener() }
}

function user2Model(overrides: Partial<AccountDrawerModel> = {}): AccountDrawerModel {
  return {
    displayName: 'Nguyễn An',
    username: 'nguyenan',
    kind: 'user2',
    canEditProfile: true,
    canManageNotifications: true,
    canChangePassword: true,
    canDeleteAccount: false,
    ...overrides,
  }
}

function textTree(root: FakeElement): string {
  return [root.textContent ?? '', ...root.children.map(textTree)].join(' ')
}

describe('Chatwoot account drawer', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: (tag: string) => new FakeElement(tag) },
    })
  })
  afterEach(() => Reflect.deleteProperty(globalThis, 'document'))

  it('renders identity in Display name → @username → User type order', () => {
    const host = new FakeElement('div')
    const view = mountAccountDrawer({ host: host as unknown as HTMLElement, model: user2Model() })
    const root = view.element as unknown as FakeElement
    const identity = root.children[0]!

    expect(identity.children.map(child => child.textContent)).toEqual(['Nguyễn An', '@nguyenan', 'User 2'])
  })

  it('renders exactly Sửa thông tin, Thông báo, Quản lý tài khoản as top-level groups', () => {
    const host = new FakeElement('div')
    const view = mountAccountDrawer({ host: host as unknown as HTMLElement, model: user2Model() })
    const root = view.element as unknown as FakeElement
    const sectionLabels = root.children.slice(1).map(section => section.children[0]?.textContent)

    expect(sectionLabels).toEqual(['Sửa thông tin', 'Thông báo', 'Quản lý tài khoản'])
    expect(sectionLabels).toHaveLength(3)
  })

  it('omits destructive account controls when backend capability is false', () => {
    const host = new FakeElement('div')
    const onDeleteAccount = vi.fn()
    const view = mountAccountDrawer({
      host: host as unknown as HTMLElement,
      model: user2Model({ canDeleteAccount: false }),
      onDeleteAccount,
    })

    expect(textTree(view.element as unknown as FakeElement)).not.toContain('Xóa tài khoản')
  })

  it('renders destructive account control only when capability is true', () => {
    const host = new FakeElement('div')
    const onDeleteAccount = vi.fn()
    const view = mountAccountDrawer({
      host: host as unknown as HTMLElement,
      model: user2Model({ canDeleteAccount: true }),
      onDeleteAccount,
    })
    const root = view.element as unknown as FakeElement

    expect(textTree(root)).toContain('Xóa tài khoản')
  })
})
