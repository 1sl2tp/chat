import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createComposer } from './composer'

class FakeElement {
  readonly tagName: string
  className = ''
  textContent: string | null = null
  placeholder = ''
  value = ''
  type = ''
  ariaLabel = ''
  children: FakeElement[] = []
  dataset: Record<string, string> = {}
  innerHTML = ''
  title = ''

  constructor(tag: string) { this.tagName = tag.toUpperCase() }
  append(...nodes: FakeElement[]) { this.children.push(...nodes) }
  replaceChildren(...nodes: FakeElement[]) { this.children = [...nodes] }
  addEventListener() {}
  setAttribute() {}
}

function find(root: FakeElement, tag: string): FakeElement | undefined {
  if (root.tagName === tag.toUpperCase()) return root
  for (const child of root.children) {
    const found = find(child, tag)
    if (found) return found
  }
  return undefined
}

describe('Chatwoot reply box', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: (tag: string) => new FakeElement(tag) },
    })
  })
  afterEach(() => Reflect.deleteProperty(globalThis, 'document'))

  it('renders one compact + | textarea | mic/send row', () => {
    const host = new FakeElement('footer')
    const composer = createComposer({ host: host as unknown as HTMLElement })
    const root = composer.element as unknown as FakeElement
    expect(root.children).toHaveLength(3)
    expect(root.children[0]?.tagName).toBe('BUTTON')
    expect(root.children[1]?.tagName).toBe('TEXTAREA')
    expect(root.children[2]?.tagName).toBe('BUTTON')
    expect(find(root, 'TEXTAREA')?.placeholder).toBe('Nhập tin nhắn…')
  })

  it('replaces the normal input row while recording instead of stacking a second card', () => {
    const host = new FakeElement('footer')
    const composer = createComposer({ host: host as unknown as HTMLElement })
    composer.setRecording(true)
    const root = composer.element as unknown as FakeElement
    expect(root.children).toHaveLength(1)
    expect(root.children[0]?.className).toContain('cw-composer__recording')
    expect(find(root, 'TEXTAREA')).toBeUndefined()
  })
})
