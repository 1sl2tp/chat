export const LIVEKIT_EXPECTED_HOST = 'taphoa-chat-dvo9mem2.livekit.cloud'

export function liveKitRoomName(callId: string): string {
  const normalized = callId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
  if (!normalized) throw new Error('call_id_missing')
  return `taphoa-call-${normalized}`
}

export function assertLiveKitServerUrl(serverUrl: string): void {
  const url = new URL(serverUrl)
  if (url.protocol !== 'wss:' || url.hostname !== LIVEKIT_EXPECTED_HOST) {
    throw new Error('livekit_server_mismatch')
  }
}
