import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountVoiceCallUi, statusText } from './ui'
import type { VoiceCallSession, VoiceCallState } from './voice-session'

class FakeElement {
  type = ''
  className = ''
  textContent = ''
  title = ''
  innerHTML = ''
  disabled = false
  dataset: Record<string, string> = {}
  children: FakeElement[] = []
  attributes = new Map<string, string>()
  private clickHandler: (() => void) | null = null

  addEventListener(type: string, handler: () => void): void {
    if (type === 'click') this.clickHandler = handler
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children)
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = [...children]
  }

  click(): void {
    this.clickHandler?.()
  }
}

function state(patch: Partial<VoiceCallState> = {}): VoiceCallState {
  return {
    phase: 'idle',
    display: 'full',
    direction: null,
    callId: null,
    peerName: '',
    muted: false,
    speakerAvailable: false,
    speakerSelected: false,
    audioBlocked: false,
    resumeRequired: false,
    permissionNotice: null,
    connectedAt: null,
    error: null,
    ...patch,
  }
}

function findByClass(root: FakeElement, value: string): FakeElement | null {
  if (root.className.split(' ').includes(value)) return root
  for (const child of root.children) {
    const found = findByClass(child, value)
    if (found) return found
  }
  return null
}

function findByLabel(root: FakeElement, value: string): FakeElement | null {
  if (root.attributes.get('aria-label') === value) return root
  for (const child of root.children) {
    const found = findByLabel(child, value)
    if (found) return found
  }
  return null
}

function mountHarness(initialState: VoiceCallState) {
  let currentState = initialState
  let listener: ((value: VoiceCallState) => void) | null = null
  const hangup = vi.fn(async () => undefined)
  const toggleMute = vi.fn(() => undefined)
  const chooseSpeaker = vi.fn(async () => undefined)
  const setDisplay = vi.fn((display: VoiceCallState['display']) => {
    currentState = { ...currentState, display }
    listener?.(currentState)
  })
  const decline = vi.fn(async () => undefined)
  const accept = vi.fn(async () => undefined)
  const resumeFromUserGesture = vi.fn(async () => undefined)
  const dismissError = vi.fn(() => undefined)
  const startAudio = vi.fn(() => undefined)

  const session = {
    getState: () => currentState,
    subscribe(next: (value: VoiceCallState) => void) {
      listener = next
      next(currentState)
      return () => { listener = null }
    },
    hangup,
    toggleMute,
    chooseSpeaker,
    setDisplay,
    decline,
    accept,
    resumeFromUserGesture,
    dismissError,
    startAudio,
  } as unknown as VoiceCallSession

  const host = new FakeElement()
  vi.stubGlobal('document', { createElement: () => new FakeElement() })
  vi.stubGlobal('window', {
    setInterval: () => 1,
    clearInterval: () => undefined,
  })

  return {
    host,
    session,
    hangup,
    toggleMute,
    chooseSpeaker,
    setDisplay,
    decline,
    accept,
    resumeFromUserGesture,
    dismissError,
    startAudio,
    update(next: VoiceCallState) {
      currentState = next
      listener?.(next)
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('Chatwoot CallCard status', () => {
  it('keeps reconnect and resume status explicit', () => {
    expect(statusText(state({ phase: 'reconnecting' }))).toBe('Đang nối lại…')
    expect(statusText(state({ phase: 'reconnecting', resumeRequired: true }))).toBe('Chạm để tiếp tục cuộc gọi')
  })
})

describe('Chatwoot CallCard actions', () => {
  it('renders incoming Accept and Reject on one call card', () => {
    const harness = mountHarness(state({ phase: 'incoming', direction: 'incoming', peerName: 'User' }))
    const dispose = mountVoiceCallUi(harness.host as unknown as HTMLElement, harness.session)

    expect(findByClass(harness.host, 'cw-call-widget')).not.toBeNull()
    expect(findByClass(harness.host, 'cw-call-card')).not.toBeNull()
    findByLabel(harness.host, 'Nhận')?.click()
    findByLabel(harness.host, 'Từ chối')?.click()
    expect(harness.accept).toHaveBeenCalledOnce()
    expect(harness.decline).toHaveBeenCalledOnce()
    dispose()
  })

  it('renders Mute, Speaker and End for an active call when speaker routing is available', () => {
    const harness = mountHarness(state({ phase: 'active', direction: 'outgoing', peerName: 'Hỗ trợ', connectedAt: Date.now() - 5_000, speakerAvailable: true }))
    const dispose = mountVoiceCallUi(harness.host as unknown as HTMLElement, harness.session)

    findByLabel(harness.host, 'Tắt mic')?.click()
    findByLabel(harness.host, 'Bật loa ngoài')?.click()
    findByLabel(harness.host, 'Kết thúc')?.click()
    expect(harness.toggleMute).toHaveBeenCalledOnce()
    expect(harness.chooseSpeaker).toHaveBeenCalledOnce()
    expect(harness.hangup).toHaveBeenCalledOnce()
    dispose()
  })

  it('keeps Continue and End available for a restored call awaiting a gesture', () => {
    const harness = mountHarness(state({ phase: 'reconnecting', resumeRequired: true, peerName: 'Hỗ trợ' }))
    const dispose = mountVoiceCallUi(harness.host as unknown as HTMLElement, harness.session)

    findByLabel(harness.host, 'Tiếp tục')?.click()
    findByLabel(harness.host, 'Kết thúc')?.click()
    expect(harness.resumeFromUserGesture).toHaveBeenCalledOnce()
    expect(harness.hangup).toHaveBeenCalledOnce()
    dispose()
  })

  it('keeps blocked-audio recovery inside the same CallCard', () => {
    const harness = mountHarness(state({ phase: 'active', audioBlocked: true, connectedAt: Date.now() }))
    const dispose = mountVoiceCallUi(harness.host as unknown as HTMLElement, harness.session)

    findByLabel(harness.host, 'Bật âm thanh')?.click()
    expect(harness.startAudio).toHaveBeenCalledOnce()
    dispose()
  })

  it('keeps error dismissal inside the same CallCard', () => {
    const harness = mountHarness(state({ phase: 'error', error: 'Không kết nối được cuộc gọi' }))
    const dispose = mountVoiceCallUi(harness.host as unknown as HTMLElement, harness.session)

    findByLabel(harness.host, 'Đóng')?.click()
    expect(harness.dismissError).toHaveBeenCalledOnce()
    dispose()
  })

  it('supports full → compact → full and full → hidden → full without changing call runtime', () => {
    const harness = mountHarness(state({ phase: 'active', peerName: 'Hỗ trợ', connectedAt: Date.now() }))
    const dispose = mountVoiceCallUi(harness.host as unknown as HTMLElement, harness.session)

    findByLabel(harness.host, 'Thu nhỏ cuộc gọi')?.click()
    expect(harness.setDisplay).toHaveBeenCalledWith('compact')
    expect(findByClass(harness.host, 'cw-call-compact')).not.toBeNull()

    findByLabel(harness.host, 'Mở toàn màn hình')?.click()
    expect(harness.setDisplay).toHaveBeenCalledWith('full')
    expect(findByClass(harness.host, 'cw-call-card')).not.toBeNull()

    findByLabel(harness.host, 'Ẩn cuộc gọi')?.click()
    expect(harness.setDisplay).toHaveBeenCalledWith('hidden')
    expect(findByClass(harness.host, 'cw-call-hidden')).not.toBeNull()

    findByLabel(harness.host, 'Hiện cuộc gọi')?.click()
    expect(harness.setDisplay).toHaveBeenCalledWith('full')
    expect(findByClass(harness.host, 'cw-call-card')).not.toBeNull()
    dispose()
  })
})
