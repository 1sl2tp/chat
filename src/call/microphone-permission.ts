export type MicrophonePermissionState = 'granted' | 'prompt' | 'denied' | 'unknown'

type PermissionQueryLike = {
  query(descriptor: PermissionDescriptor): Promise<{ state: PermissionState }>
}

export async function readMicrophonePermission(
  permissions?: PermissionQueryLike,
): Promise<MicrophonePermissionState> {
  if (!permissions) return 'unknown'
  try {
    const status = await permissions.query({ name: 'microphone' } as PermissionDescriptor)
    if (status.state === 'granted' || status.state === 'prompt' || status.state === 'denied') {
      return status.state
    }
  } catch {
    // Safari versions that do not expose microphone through Permissions API land here.
  }
  return 'unknown'
}

export function microphonePermissionNotice(
  state: MicrophonePermissionState,
  userAgent: string,
): string | null {
  if (state !== 'prompt' || !/iPhone/i.test(userAgent)) return null
  return 'Safari đang để Microphone ở Hỏi. Muốn không hỏi lại, đặt Microphone của chat.taphoa.xyz thành Cho phép trong Cài đặt trang web.'
}
