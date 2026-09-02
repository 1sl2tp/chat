import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountConversationScreen } from './conversation-screen'

class FakeElement {
  readonly tagName: string
  className = ''
  textContent: string | null = null
  children: FakeElement[] = []
  dataset: Record<string, string> = {}
  type = ''
  ariaLabel = ''
  hidden = false
  private listeners = new Map<string, (() => void)[]>()

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase()
  }

  append(...nodes: FakeElement[]) {
    this.children.push(...nodes)
  }

  replaceChildren(...nodes: FakeElement[]) {
    this.children = [...nodes]
  }

  addEventListener(type: string, handler: () => void) {
    const handlers = this.listeners.get(type) ?? []
    handlers.push(handler)
    this.listeners.set(type, handlers)
  }
}

describe('Chatwoot conversation shell', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: (tag: string) => new FakeElement(tag) },
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('mounts exactly header, timeline and composer as vertical owners', () => {
    const root = new FakeElement('div')
    const mounted = mountConversationScreen({
      root: root as unknown as HTMLElement,
      model: { id: 'c-1', title: 'Hỗ trợ', subtitle: 'Đang hoạt động', messages: [] },
    })

    expect(root.children).toHaveLength(1)
    const shell = root.children[0]!
    expect(shell.children.map(child => child.tagName)).toEqual(['HEADER', 'MAIN', 'FOOTER'])
    expect(mounted.timeline).toBe(shell.children[1] as unknown as HTMLElement)
    expect(mounted.composerHost).toBe(shell.children[2] as unknown as HTMLElement)
  })

  it('uses the same dark reference shell regardless of User/Admin route context', () => {
    const root = new FakeElement('div')
    mountConversationScreen({
      root: root as unknown as HTMLElement,
      model: { id: 'c-2', title: 'test1', subtitle: 'User 2 · @test1', messages: [] },
    })

    const shell = root.children[0]!
    const classes = shell.className.split(/\s+/)
    expect(classes).toContain('cw-conversation')
    expect(classes).toContain('bg-slate-950')
    expect(classes).toContain('flex-col')
    expect(shell.dataset.conversationId).toBe('c-2')
  })
})
