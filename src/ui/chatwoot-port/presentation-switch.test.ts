import { describe, expect, it } from 'vitest'
import { getChatPresentation, setChatPresentation } from './presentation-switch'

describe('chat presentation switch', () => {
  it('defaults safely to legacy presentation', () => {
    expect(getChatPresentation()).toBe('legacy')
  })

  it('can opt into Chatwoot port and roll back', () => {
    setChatPresentation('chatwoot-port')
    expect(getChatPresentation()).toBe('chatwoot-port')

    setChatPresentation('legacy')
    expect(getChatPresentation()).toBe('legacy')
  })
})
