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
    permissionNotice: null,
    connectedAt: null,
    error: null,
    ...patch,
  }
}

function findByHtml(root: FakeElement, value: string): FakeElement | null {
  if (root.innerHTML.includes(value)) return root
  for (const child of root.children) {
    const found = findByHtml(child, value)
    if (found) return found
  }
  return null
}

function findByClass(root: FakeElement, value: string): FakeElement | null {
  if (root.className.split(' ').includes(value)) return root
  for (const child of root.children) {
    const found = findByClass(child, value)
    if (found) return found
  }
  return null
}

function mountHarness(initialState: VoiceCallState) {
  let currentState = initialState
  let listener: ((value: VoiceCallState) => void) | null = null
  const setDisplay = vi.fn((display: VoiceCallState['display']) => {
    currentState = { ...currentState, display }
    listener?.(currentState)
  })
  const hangup = vi.fn(async () => undefined)
  const toggleMute = vi.fn(() => undefined)
  const decline = vi.fn(async () => undefined)
  const accept = vi.fn(async () => undefined)
  const dismissError = vi.fn(() => undefined)

  const session = {
    getState: () => currentState,
    subscribe(next: (value: VoiceCallState) => void) {
      listener = next
      next(currentState)
      return () => { listener = null }
    },
    setDisplay,
    hangup,
    toggleMute,
    decline,
    accept,
    dismissError,
    startAudio: vi.fn(() => undefined),
    hasPhoneSpeakerToggle: () => false,
    chooseSpeaker: vi.fn(async () => undefined),
  } as unknown as VoiceCallSession

  const host = new FakeElement()
  vi.stubGlobal('document', {
    createElement: () => new FakeElement(),
  })
  vi.stubGlobal('navigator', { userAgent: 'test' })
  vi.stubGlobal('window', {
    setInterval: () => 1,
    clearInterval: () => undefined,
  })

  return {
    host,
    session,
    setDisplay,
    hangup,
    toggleMute,
    decline,
    accept,
    dismissError,
  }
}

const ACTIVE_STATE = state({
  phase: 'active',
  direction: 'outgoing',
  callId: '11111111-1111-4111-8111-111111111111',
  peerName: 'Admin',
  connectedAt: Date.now() - 5_000,
})

const ERROR_STATE = state({
  phase: 'error',
  direction: 'outgoing',
  peerName: 'Admin',
  error: 'Không kết nối được cuộc gọi',
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('voice call reconnect UI', () => {
  it('shows an explicit reconnecting status', () => {
    expect(statusText(state({ phase: 'reconnecting' }))).toBe('Đang nối lại…')
  })
})

describe('voice call display modes', () => {
  it('full call exposes Thu nhỏ and Ẩn without ending the call', () => {
    const harness = mountHarness(ACTIVE_STATE)
    const dispose = mountVoiceCallUi(harness.host as unknown as HTMLElement, harness.session)

    expect(harness.host.children[0]?.className).toBe('voice-call-full')
    expect(findByHtml(harness.host, 'Thu nhỏ')).not.toBeNull()
    expect(findByHtml(harness.host, 'Ẩn')).not.toBeNull()
    expect(harness.hangup).not.toHaveBeenCalled()
    dispose()
  })

  it('Thu nhỏ renders the top bar and never hangs up', () => {
    const harness = mountHarness(ACTIVE_STATE)
    const dispose = mountVoiceCallUi(harness.host as unknown as HTMLElement, harness.session)

    findByHtml(harness.host, 'Thu nhỏ')?.click()

    expect(harness.setDisplay).toHaveBeenCalledWith('compact')
    expect(harness.host.children[0]?.className).toBe('voice-call-topbar')
    expect(findByHtml(harness.host, 'Tắt mic')).not.toBeNull()
    expect(findByHtml(harness.host, 'Kết thúc')).not.toBeNull()
    expect(harness.hangup).not.toHaveBeenCalled()
    dispose()
  })

  it('hidden renders only the floating restore control and restore returns to full', () => {
    const harness = mountHarness({ ...ACTIVE_STATE, display: 'hidden' })
    const dispose = mountVoiceCallUi(harness.host as unknown as HTMLElement, harness.session)

    expect(harness.host.children).toHaveLength(1)
    expect(harness.host.children[0]?.className).toBe('voice-call-hidden')
    expect(harness.hangup).not.toHaveBeenCalled()

    harness.host.children[0]?.click()

    expect(harness.setDisplay).toHaveBeenCalledWith('full')
    expect(harness.host.children[0]?.className).toBe('voice-call-full')
    expect(harness.hangup).not.toHaveBeenCalled()
    dispose()
  })

  it('incoming full screen keeps Accept and Decline call controls', () => {
    const harness = mountHarness(state({
      phase: 'incoming',
      direction: 'incoming',
      callId: '22222222-2222-4222-8222-222222222222',
      peerName: 'User',
    }))
    const dispose = mountVoiceCallUi(harness.host as unknown as HTMLElement, harness.session)

    expect(findByHtml(harness.host, 'Nhận')).not.toBeNull()
    expect(findByHtml(harness.host, 'Từ chối')).not.toBeNull()
    expect(findByHtml(harness.host, 'Bật thông báo')).toBeNull()
    dispose()
  })
})

describe('voice call error UI', () => {
  it('keeps an error inside the full call screen instead of showing a second popup', () => {
    const harness = mountHarness(ERROR_STATE)
    const dispose = mountVoiceCallUi(harness.host as unknown as HTMLElement, harness.session)

    expect(harness.host.children[0]?.className).toBe('voice-call-full')
    expect(findByClass(harness.host, 'voice-call-error')).toBeNull()
    expect(findByHtml(harness.host, 'Đóng')).not.toBeNull()

    findByHtml(harness.host, 'Đóng')?.click()
    expect(harness.dismissError).toHaveBeenCalledOnce()
    dispose()
  })

  it('shows the compact error popup only when the call was minimized', () => {
    const harness = mountHarness({ ...ERROR_STATE, display: 'compact' })
    const dispose = mountVoiceCallUi(harness.host as unknown as HTMLElement, harness.session)

    expect(harness.host.children[0]?.className).toBe('voice-call-error')
    harness.host.children[0]?.click()
    expect(harness.dismissError).toHaveBeenCalledOnce()
    dispose()
  })

  it('shows the compact error popup when the call was hidden', () => {
    const harness = mountHarness({ ...ERROR_STATE, display: 'hidden' })
    const dispose = mountVoiceCallUi(harness.host as unknown as HTMLElement, harness.session)

    expect(harness.host.children[0]?.className).toBe('voice-call-error')
    dispose()
  })
})
