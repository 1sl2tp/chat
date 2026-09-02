import { describe, expect, it } from 'vitest'
import userShellSource from '../user-shell.ts?raw'
import { toAccountDrawerModel } from './chatwoot-account-ui'

describe('Chatwoot User account adapter', () => {
  it('maps User 1 to guest identity without unavailable account capabilities', () => {
    expect(toAccountDrawerModel('guest', null)).toEqual({
      displayName: 'Khách',
      username: undefined,
      kind: 'user1',
      canEditProfile: false,
      canManageNotifications: false,
      canChangePassword: false,
      canDeleteAccount: false,
    })
  })

  it('maps User 2 identity and supported capabilities without inventing delete-account support', () => {
    expect(toAccountDrawerModel('user2', { displayName: 'Nguyễn An', username: 'nguyenan' })).toEqual({
      displayName: 'Nguyễn An',
      username: 'nguyenan',
      kind: 'user2',
      canEditProfile: true,
      canManageNotifications: true,
      canChangePassword: true,
      canDeleteAccount: false,
    })
  })

  it('mounts Chatwoot account owner behind the same presentation switch and keeps legacy in else branch', () => {
    expect(userShellSource).toContain("from './ui/chatwoot-port/presentation-switch'")
    expect(userShellSource).toContain("from './user/chatwoot-account-ui'")
    expect(userShellSource).toContain('mountUserChatwootAccountUi')
    const branchIndex = userShellSource.indexOf("getChatPresentation() === 'chatwoot-port'")
    const legacyIndex = userShellSource.indexOf('mountUserAccountUi()', branchIndex)
    expect(branchIndex).toBeGreaterThanOrEqual(0)
    expect(legacyIndex).toBeGreaterThan(branchIndex)
    expect(userShellSource.slice(branchIndex, legacyIndex)).toContain('else')
  })
})
