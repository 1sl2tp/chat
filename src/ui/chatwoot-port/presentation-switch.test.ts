import { afterEach, describe, expect, it } from 'vitest'
import { getChatPresentation, setChatPresentation } from './presentation-switch'

describe('chat presentation switch', () => {
  afterEach(() => setChatPresentation('chatwoot-port'))

  it('defaults to the Chatwoot production presentation', () => {
    expect(getChatPresentation()).toBe('chatwoot-port')
  })

  it('can still roll back to legacy for controlled recovery', () => {
    setChatPresentation('legacy')
    expect(getChatPresentation()).toBe('legacy')

    setChatPresentation('chatwoot-port')
    expect(getChatPresentation()).toBe('chatwoot-port')
  })
})
