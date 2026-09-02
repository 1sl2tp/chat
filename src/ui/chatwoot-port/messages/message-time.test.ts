import { describe, expect, it } from 'vitest'
import { formatMessageTime } from './message-time'
import textRendererSource from './renderers/text.ts?raw'

describe('Chatwoot message time presentation', () => {
  it('formats an ISO timestamp as compact local clock time instead of exposing transport data', () => {
    const value = formatMessageTime('2026-09-02T03:51:41.223526+00:00')
    expect(value).toMatch(/^\d{1,2}:\d{2}$/)
    expect(value).not.toContain('T')
    expect(value).not.toContain('+00:00')
  })

  it('does not expose malformed transport timestamps', () => {
    expect(formatMessageTime('not-a-date')).toBe('')
  })

  it('text bubbles render formatted time while preserving the machine-readable datetime', () => {
    expect(textRendererSource).toContain('formatMessageTime(message.createdAt)')
    expect(textRendererSource).toContain('time.dateTime = message.createdAt')
    expect(textRendererSource).not.toContain('time.textContent = message.createdAt')
  })
})
