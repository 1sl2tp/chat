import { describe, expect, it } from 'vitest'
import { resolveScopedNavigation } from './navigation'

describe('scoped notification navigation', () => {
  it('normalizes legacy Admin navigation without duplicating the Admin path', () => {
    expect(
      resolveScopedNavigation('https://chat.taphoa.xyz/admin/', 'admin/?conversation=abc').href,
    ).toBe('https://chat.taphoa.xyz/admin/?conversation=abc')

    expect(
      resolveScopedNavigation('https://1sl2tp.github.io/chat/admin/', 'admin/?conversation=abc').href,
    ).toBe('https://1sl2tp.github.io/chat/admin/?conversation=abc')
  })

  it('keeps root navigation inside the deployed project scope', () => {
    expect(
      resolveScopedNavigation('https://1sl2tp.github.io/chat/', '/?conversation=abc').href,
    ).toBe('https://1sl2tp.github.io/chat/?conversation=abc')

    expect(
      resolveScopedNavigation('https://1sl2tp.github.io/chat/', './?conversation=abc').href,
    ).toBe('https://1sl2tp.github.io/chat/?conversation=abc')
  })

  it('rejects navigation outside the service-worker scope', () => {
    expect(
      resolveScopedNavigation('https://chat.taphoa.xyz/admin/', 'https://evil.example/?conversation=abc').href,
    ).toBe('https://chat.taphoa.xyz/admin/')

    expect(
      resolveScopedNavigation('https://chat.taphoa.xyz/admin/', '../?conversation=abc').href,
    ).toBe('https://chat.taphoa.xyz/admin/')
  })
})
