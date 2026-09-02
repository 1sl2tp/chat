import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createComposer } from './composer'

class FakeElement {
  readonly tagName: string
  className = ''
  textContent: string | null = null
  placeholder = ''
  value = ''
  type = ''
  ariaLabel = ''
  disabled = false
  children: FakeElement[] = []
  dataset: Record<string, string> = {}
  innerHTML = ''
  title = ''
  private listeners = new Map<string, Array<(event: any) => void>>()

  constructor(tag: string) { this.tagName = tag.toUpperCase() }
  append(...nodes: FakeElement[]) { this.children.push(...nodes) }
  replaceChildren(...nodes: FakeElement[]) { this.children = [...nodes] }
  addEventListener(type: string, listener: (event: any) => void) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }
  dispatch(type: string, event: any = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
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

function interactive(root: FakeElement): FakeElement[] {
  const own = root.tagName === 'BUTTON' || root.tagName === 'TEXTAREA' ? [root] : []
  return own.concat(root.children.flatMap(interactive))
}

describe('Chatwoot reply box', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: (tag: string) => new FakeElement(tag) },
    })
  })
  afterEach(() => Reflect.deleteProperty(globalThis, 'document'))

  it('renders reference attach | input+voice | send composition', () => {
    const host = new FakeElement('footer')
    const composer = createComposer({ host: host as unknown as HTMLElement, isMobile: false })
    const root = composer.element as unknown as FakeElement
    expect(root.children).toHaveLength(3)
    expect(root.children[0]?.tagName).toBe('BUTTON')
    expect(root.children[1]?.className).toContain('cw-composer__input-wrap')
    expect(root.children[2]?.className).toContain('cw-composer__button--send')
    expect(find(root, 'TEXTAREA')?.placeholder).toBe('Nhập tin nhắn…')
    expect(root.children[1]?.children.some(child => child.className.includes('cw-composer__button--voice'))).toBe(true)
  })

  it('replaces the normal input row while recording instead of stacking a second card', () => {
    const host = new FakeElement('footer')
    const composer = createComposer({ host: host as unknown as HTMLElement, isMobile: false })
    composer.setRecording(true)
    const root = composer.element as unknown as FakeElement
    expect(root.children).toHaveLength(1)
    expect(root.children[0]?.className).toContain('cw-composer__recording')
    expect(find(root, 'TEXTAREA')).toBeUndefined()
  })

  it('stays mounted while disabled so User never loses the ReplyBox owner', () => {
    const host = new FakeElement('footer')
    const composer = createComposer({ host: host as unknown as HTMLElement, isMobile: false })
    composer.setEnabled(false)
    const root = composer.element as unknown as FakeElement

    expect(root.children).toHaveLength(3)
    expect(interactive(root).every(control => control.disabled)).toBe(true)
    expect(find(root, 'TEXTAREA')?.placeholder).toBe('Nhập tin nhắn…')

    composer.setEnabled(true)
    expect(interactive(root).every(control => !control.disabled)).toBe(true)
  })

  it('sends with Enter on desktop but keeps Shift+Enter as a newline', async () => {
    const sent: string[] = []
    const host = new FakeElement('footer')
    const composer = createComposer({
      host: host as unknown as HTMLElement,
      isMobile: false,
      onSend: async text => { sent.push(text) },
    })
    const textarea = composer.textarea as unknown as FakeElement
    textarea.value = 'Xin chào'
    const preventDefault = vi.fn()

    textarea.dispatch('keydown', { key: 'Enter', isComposing: false, shiftKey: false, preventDefault })
    await Promise.resolve()
    await Promise.resolve()

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(sent).toEqual(['Xin chào'])

    textarea.value = 'Dòng 2'
    textarea.dispatch('keydown', { key: 'Enter', isComposing: false, shiftKey: true, preventDefault })
    await Promise.resolve()
    expect(sent).toEqual(['Xin chào'])
  })

  it('keeps Enter as a newline on mobile instead of sending', async () => {
    const onSend = vi.fn()
    const host = new FakeElement('footer')
    const composer = createComposer({
      host: host as unknown as HTMLElement,
      isMobile: true,
      onSend,
    })
    const textarea = composer.textarea as unknown as FakeElement
    textarea.value = 'Tin nhắn mobile'
    const preventDefault = vi.fn()

    textarea.dispatch('keydown', { key: 'Enter', isComposing: false, shiftKey: false, preventDefault })
    await Promise.resolve()

    expect(preventDefault).not.toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
  })
})
