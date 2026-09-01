import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountVoiceCallUi } from './ui'
import type { VoiceCallSession, VoiceCallState } from './voice-session'

class FakeElement {
  type = ''
  className = ''
  textContent = ''
  title = ''
  children: FakeElement[] = []
  private clickHandler: (() => void) | null = null

  addEventListener(type: string, handler: () => void): void {
    if (type === 'click') this.clickHandler = handler
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

const ERROR_STATE: VoiceCallState = {
  phase: 'error',
  display: 'full',
  direction: 'outgoing',
  callId: null,
  peerName: 'Admin',
  muted: false,
  speakerAvailable: false,
  speakerSelected: false,
  audioBlocked: false,
  permissionNotice: null,
  connectedAt: null,
  error: 'Đối phương đang trong cuộc gọi',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('voice call error UI', () => {
  it('dismisses error back to idle instead of trying to hide the error display', () => {
    const dismissError = vi.fn(() => undefined)
    const setDisplay = vi.fn(() => undefined)
    const session = {
      getState: () => ERROR_STATE,
      subscribe(listener: (state: VoiceCallState) => void) {
        listener(ERROR_STATE)
        return () => undefined
      },
      dismissError,
      setDisplay,
    } as unknown as VoiceCallSession
    const host = new FakeElement()

    vi.stubGlobal('document', {
      createElement: () => new FakeElement(),
    })
    vi.stubGlobal('window', {
      setInterval: () => 1,
      clearInterval: () => undefined,
    })

    const dispose = mountVoiceCallUi(host as unknown as HTMLElement, session)
    host.children[0]?.click()

    expect(dismissError).toHaveBeenCalledOnce()
    expect(setDisplay).not.toHaveBeenCalled()
    dispose()
  })
})
