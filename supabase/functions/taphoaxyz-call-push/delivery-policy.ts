export interface ClassifiedPushSendError {
  expired: boolean
  statusCode: number
  reason: string
}

export function classifyPushSendError(error: unknown): ClassifiedPushSendError {
  const candidate = error as { statusCode?: unknown; message?: unknown } | null
  const statusCode = Number(candidate?.statusCode || 0)
  const rawMessage = error instanceof Error
    ? error.message
    : typeof candidate?.message === 'string'
      ? candidate.message
      : 'push_send_failed'
  const message = rawMessage.replace(/\s+/g, ' ').trim() || 'push_send_failed'

  return {
    expired: statusCode === 404 || statusCode === 410,
    statusCode,
    reason: `${statusCode}:${message}`.slice(0, 200),
  }
}

export function shouldFailPushDelivery(delivered: number, failed: number): boolean {
  return delivered === 0 && failed > 0
}
