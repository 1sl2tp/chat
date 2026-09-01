import { describe, expect, it } from 'vitest'
import { capabilitiesForRootMode } from './capabilities'

describe('root user capabilities', () => {
  it('keeps User1 chat-only', () => {
    expect(capabilitiesForRootMode('guest')).toEqual({ call: false, push: false })
  })

  it('allows User2 Call and Push', () => {
    expect(capabilitiesForRootMode('user2')).toEqual({ call: true, push: true })
  })
})
