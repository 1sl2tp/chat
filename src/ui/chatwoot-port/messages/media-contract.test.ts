import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MessageViewModel } from '../contracts'
import { presentMessages } from './message-model'
import { createMessageListView, renderMessage } from './message-list'

class FakeElement {
  readonly tagName: string
  className = ''
  textContent: string | null = null
  children: FakeElement[] = []
  dataset: Record<string, string> = {}
  style: Record<string, string> = {}
  type = ''
  src = ''
  alt = ''
  preload = ''
  ariaLabel = ''
  min = ''
  max = ''
  step = ''
  value = ''

  constructor(tagName: string) { this.tagName = tagName.toUpperCase() }
  append(...nodes: FakeElement[]) { this.children.push(...nodes) }
  replaceChildren(...nodes: FakeElement[]) { this.children = [...nodes] }
  addEventListener() {}
}

const audioMessage: MessageViewModel = {
  id: 'audio-1',
  kind: 'audio',
  direction: 'outgoing',
  createdAt: '2026-09-02T12:00:00Z',
  attachment: { url: 'https://example.com/a.webm', name: 'voice-1788357882159.webm' },
}

function findByClass(root: FakeElement, token: string): FakeElement | undefined {
  if (root.className.split(' ').includes(token)) return root
  for (const child of root.children) {
    const found = findByClass(child, token)
    if (found) return found
  }
  return undefined
}

describe('Chatwoot media presentation', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: (tag: string) => new FakeElement(tag) },
    })
  })
  afterEach(() => Reflect.deleteProperty(globalThis, 'document'))

  it('reserves image aspect ratio before the image loads', () => {
    const image = renderMessage({
      id: 'image-1', kind: 'image', direction: 'incoming', createdAt: '2026-09-02T12:00:00Z',
      attachment: { url: 'https://example.com/a.jpg', width: 640, height: 360 },
      groupWithPrevious: false, groupWithNext: false,
    }) as unknown as FakeElement
    const frame = findByClass(image, 'cw-media--image')!
    expect(frame.style.aspectRatio).toBe('640 / 360')
  })

  it('keeps media actions inside a contextual overlay instead of a permanent row', () => {
    const audio = renderMessage({ ...audioMessage, groupWithPrevious: false, groupWithNext: false }) as unknown as FakeElement
    expect(findByClass(audio, 'cw-media-actions')).toBeTruthy()
    expect(findByClass(audio, 'cw-media-actions__menu')).toBeTruthy()
    expect(findByClass(audio, 'cw-media-actions--permanent')).toBeUndefined()
  })

  it('renders voice notes as an actual player instead of exposing the raw webm filename', () => {
    const audio = renderMessage({ ...audioMessage, groupWithPrevious: false, groupWithNext: false }) as unknown as FakeElement
    expect(findByClass(audio, 'cw-audio-player__play')).toBeTruthy()
    expect(findByClass(audio, 'cw-audio-player__range')).toBeTruthy()
    expect(findByClass(audio, 'cw-audio-player__time')).toBeTruthy()
    expect(findByClass(audio, 'cw-audio-player__label')?.textContent).toBe('Ghi âm')
  })

  it('reuses the same audio root when an unchanged message list is updated', () => {
    const host = new FakeElement('div')
    const view = createMessageListView(host as unknown as HTMLElement)
    view.update(presentMessages([audioMessage]))
    const first = findByClass(host, 'cw-audio-player')
    view.update(presentMessages([audioMessage]))
    const second = findByClass(host, 'cw-audio-player')
    expect(first).toBe(second)
  })
})
