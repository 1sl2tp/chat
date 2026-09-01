import { describe, expect, it } from 'vitest'
import { APP_VERSION, formatVersionLabel } from './version'

describe('version tracking', () => {
  it('keeps a named release version in code', () => {
    expect(APP_VERSION).toBe('CHAT-ADMIN-0.11.0')
  })

  it('shows both release version and build id on screen', () => {
    expect(formatVersionLabel('abc1234')).toBe('CHAT-ADMIN-0.11.0 · abc1234')
  })
})
