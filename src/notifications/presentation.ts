import type { CallPushIssue, CallPushState } from './call-push-registration'

export interface NotificationButtonPresentation {
  label: string
  disabled: boolean
}

export function notificationButtonPresentation(
  state: CallPushState,
  issue: CallPushIssue,
  pending = false,
): NotificationButtonPresentation {
  if (pending) {
    return {
      label: state === 'enabled' ? 'Đang kiểm tra…' : 'Đang bật…',
      disabled: true,
    }
  }
  if (state === 'enabled') return { label: 'Kiểm tra thông báo ✓', disabled: false }
  if (state === 'denied') return { label: 'Thông báo bị chặn', disabled: true }
  if (state === 'unsupported' && issue === 'ios_home_screen_required') {
    return { label: 'Cài vào Màn hình chính để bật thông báo', disabled: true }
  }
  if (state === 'unsupported') return { label: 'Thiết bị không hỗ trợ thông báo', disabled: true }
  if (state === 'error' && issue === 'delivery_failed') {
    return { label: 'Không nhận được thông báo · thử lại', disabled: false }
  }
  if (state === 'error' && issue === 'registration_failed') {
    return { label: 'Đăng ký thông báo lỗi · thử lại', disabled: false }
  }
  return { label: 'Bật thông báo', disabled: false }
}
