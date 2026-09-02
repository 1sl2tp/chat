import { describe, expect, it } from 'vitest'
import { accountUiMode, userAccountErrorMessage, userAccountSummary } from './account-ui'

describe('User account UI', () => {
  it('distinguishes User1 guest from User2 using the shell mode label', () => {
    expect(accountUiMode('User 1 · Vãng lai')).toBe('guest')
    expect(accountUiMode('User 1')).toBe('guest')
    expect(accountUiMode('User 2')).toBe('user2')
  })

  it('keeps account validation messages short and user-facing', () => {
    expect(userAccountErrorMessage(new Error('invalid_display_name'))).toBe('Tên hiển thị chưa hợp lệ.')
    expect(userAccountErrorMessage(new Error('invalid_username'))).toBe('Tài khoản dùng 3–24 ký tự: a-z, 0-9, _.')
    expect(userAccountErrorMessage(new Error('username_taken'))).toBe('Tài khoản này đã được sử dụng.')
    expect(userAccountErrorMessage(new Error('password_too_short'))).toBe('Mật khẩu cần ít nhất 6 ký tự.')
  })

  it('builds a clear summary for User 2', () => {
    expect(userAccountSummary('user2', { displayName: 'Bùi Hải An', username: 'buihaian' })).toEqual({
      displayName: 'Bùi Hải An',
      typeLabel: 'User 2',
      accountLabel: '@buihaian',
    })
  })

  it('builds a clear User 1 summary without pretending there is an account', () => {
    expect(userAccountSummary('guest', null)).toEqual({
      displayName: 'Khách',
      typeLabel: 'User 1',
      accountLabel: 'Chưa có tài khoản',
    })
  })
})
