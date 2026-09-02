import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MessageKind, MessageViewModel } from '../contracts'
import { renderMessage } from './message-list'

class FakeElement {
  readonly tagName: string
  className = ''
  textContent: string | null = null
  children: FakeElement[] = []
  dataset: Record<string, string> = {}
  type = ''
  ariaLabel = ''

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase()
  }

  append(...nodes: FakeElement[]) {
    this.children.push(...nodes)
  }

  addEventListener() {}
}

const message = (kind: MessageKind): MessageViewModel => ({
  id: `m-${kind}`,
  kind,
  direction: kind === 'system' || kind === 'call' ? 'center' : 'incoming',
  senderId: 'u1',
  text: kind === 'text' || kind === 'link' || kind === 'system' || kind === 'call' ? 'Nội dung' : undefined,
  createdAt: '2026-09-02T12:34:00Z',
  attachment:
    kind === 'image' || kind === 'audio' || kind === 'file'
      ? { url: 'https://example.com/a', name: 'a.bin', width: 320, height: 180 }
      : undefined,
  reaction: kind === 'text' ? 'heart' : undefined,
})

describe('Chatwoot message renderer', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: (tag: string) => new FakeElement(tag) },
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('dispatches all message kinds to a dedicated renderer class', () => {
    const kinds: MessageKind[] = ['text', 'image', 'audio', 'file', 'link', 'system', 'call']
    for (const kind of kinds) {
      const element = renderMessage({ ...message(kind), groupWithPrevious: false, groupWithNext: false })
      expect(element.className).toContain(`cw-message--${kind}`)
    }
  })

  it('keeps timestamp in flow footer and heart in a separate reaction slot', () => {
    const element = renderMessage({ ...message('text'), groupWithPrevious: false, groupWithNext: false }) as unknown as FakeElement
    const bubble = element.children[0]!
    const footer = bubble.children.find(child => child.className.includes('cw-message__footer'))!
    const reaction = bubble.children.find(child => child.className.includes('cw-message__reaction-slot'))!

    expect(footer.className).toContain('cw-message__footer')
    expect(reaction.className).toContain('cw-message__reaction-slot')
    expect(footer).not.toBe(reaction)
  })

  it('does not attach reaction UI to system or call rows', () => {
    for (const kind of ['system', 'call'] as const) {
      const element = renderMessage({ ...message(kind), reaction: 'heart', groupWithPrevious: false, groupWithNext: false }) as unknown as FakeElement
      const hasReaction = element.children.some(child => child.className.includes('reaction')) ||
        element.children.some(child => child.children.some(grandchild => grandchild.className.includes('reaction')))
      expect(hasReaction).toBe(false)
    }
  })
})
