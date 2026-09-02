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

  it('mounts only the Chatwoot account owner in the production User shell', () => {
    expect(userShellSource).toContain("from './user/chatwoot-account-ui'")
    expect(userShellSource).toContain('mountUserChatwootAccountUi()')
    expect(userShellSource).not.toContain('presentation-switch')
    expect(userShellSource).not.toContain('mountUserAccountUi')
    expect(userShellSource).not.toContain("from './user/account-ui'")
  })
})
