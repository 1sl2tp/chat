import { describe, expect, it } from 'vitest'
import { notificationButtonPresentation } from './presentation'

describe('notification button presentation', () => {
  it('keeps prompt actionable', () => {
    expect(notificationButtonPresentation('prompt', null)).toEqual({
      label: 'Bật thông báo',
      disabled: false,
    })
  })

  it('keeps enabled state actionable so delivery can be re-tested', () => {
    expect(notificationButtonPresentation('enabled', null)).toEqual({
      label: 'Kiểm tra thông báo ✓',
      disabled: false,
    })
  })

  it('shows immediate progress while an enabled self-test is running', () => {
    expect(notificationButtonPresentation('enabled', null, true)).toEqual({
      label: 'Đang kiểm tra…',
      disabled: true,
    })
  })

  it('explains iOS Home Screen requirement instead of hiding the control', () => {
    expect(notificationButtonPresentation('unsupported', 'ios_home_screen_required')).toEqual({
      label: 'Cài vào Màn hình chính để bật thông báo',
      disabled: true,
    })
  })

  it('shows a retry action when registration or delivery failed', () => {
    expect(notificationButtonPresentation('error', 'delivery_failed')).toEqual({
      label: 'Không nhận được thông báo · thử lại',
      disabled: false,
    })
    expect(notificationButtonPresentation('error', 'registration_failed')).toEqual({
      label: 'Đăng ký thông báo lỗi · thử lại',
      disabled: false,
    })
  })

  it('shows denied and generic unsupported as non-actionable', () => {
    expect(notificationButtonPresentation('denied', 'permission_denied').disabled).toBe(true)
    expect(notificationButtonPresentation('unsupported', 'unsupported').disabled).toBe(true)
  })
})
