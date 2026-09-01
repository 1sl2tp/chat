import { describe, expect, it } from 'vitest'
import { hasVisibleWindowForOwner } from './owner-visibility'

describe('PWA owner foreground visibility', () => {
  const windows = [
    { url: 'https://chat.taphoa.xyz/', visibilityState: 'visible' },
    { url: 'https://chat.taphoa.xyz/admin/', visibilityState: 'hidden' },
  ]

  it('does not let visible root User suppress Admin notifications', () => {
    expect(hasVisibleWindowForOwner(windows, 'admin')).toBe(false)
  })

  it('does not let visible Admin suppress root User notifications', () => {
    const adminVisible = [
      { url: 'https://chat.taphoa.xyz/', visibilityState: 'hidden' },
      { url: 'https://chat.taphoa.xyz/admin/', visibilityState: 'visible' },
    ]
    expect(hasVisibleWindowForOwner(adminVisible, 'user')).toBe(false)
  })

  it('detects a visible window owned by the same app', () => {
    expect(hasVisibleWindowForOwner(windows, 'user')).toBe(true)
  })
})
