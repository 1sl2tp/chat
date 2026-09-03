import { describe, expect, it } from 'vitest'
import userShellSource from '../user-shell.ts?raw'
import userCleanSource from '../user-clean-main.ts?raw'
import { toAccountDrawerModel } from './chatwoot-account-ui'

describe('User account capability and clean production owner', () => {
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

  it('mounts only the clean account owner in the production User path', () => {
    expect(userShellSource).toContain("import './ui/clean/theme.css'")
    expect(userShellSource).toContain("import './user-clean-main'")
    expect(userCleanSource).toContain('createCleanUserUi')
    expect(userCleanSource).toContain('loginUser2')
    expect(userCleanSource).toContain('logoutUser2')
    expect(userShellSource).not.toContain('chatwoot-account-ui')
    expect(userShellSource).not.toContain('mountUserChatwootAccountUi')
    expect(userShellSource).not.toContain('mountUserAccountUi')
  })
})
