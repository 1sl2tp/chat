import type { ChatMessage } from '../../chat/messages'

const MISSED_CALL_TEXT = /^(?:Cuộc gọi đã hủy|Đã từ chối)$/i
const NORMALIZED_MISSED_TEXT = '📞 Cuộc gọi chưa kết nối'

function isMissedCallEvent(message: ChatMessage): boolean {
  return message.type === 'call' && MISSED_CALL_TEXT.test(message.text?.trim() ?? '')
}

function isNormalizedMissedCall(message: ChatMessage): boolean {
  return message.type === 'call' && (message.text?.trim() ?? '') === NORMALIZED_MISSED_TEXT
}

function normalizeCallSessions(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []
  let index = 0

  while (index < messages.length) {
    const first = messages[index]!
    if (first.type !== 'call' || !first.call_id) {
      result.push(isMissedCallEvent(first) ? { ...first, text: NORMALIZED_MISSED_TEXT } : first)
      index += 1
      continue
    }

    let end = index + 1
    while (end < messages.length) {
      const next = messages[end]!
      if (next.type !== 'call' || next.call_id !== first.call_id) break
      end += 1
    }

    const session = messages.slice(index, end)
    const completed = [...session].reverse().find((message) => !isMissedCallEvent(message))
    const representative = completed ?? session[session.length - 1]!
    const collapsed = session.length > 1
      ? {
          ...representative,
          id: `call-session:${first.call_id}`,
          client_message_id: `call-session:${first.call_id}`,
        }
      : representative

    result.push(completed ? collapsed : { ...collapsed, text: NORMALIZED_MISSED_TEXT })
    index = end
  }

  return result
}

export function compactCallTimelineMessages(messages: ChatMessage[]): ChatMessage[] {
  const normalized = normalizeCallSessions(messages)
  const result: ChatMessage[] = []
  let index = 0

  while (index < normalized.length) {
    const first = normalized[index]!
    if (!isNormalizedMissedCall(first)) {
      result.push(first)
      index += 1
      continue
    }

    let end = index + 1
    while (end < normalized.length && isNormalizedMissedCall(normalized[end]!)) end += 1

    const count = end - index
    if (count === 1) {
      result.push(first)
      index = end
      continue
    }

    const last = normalized[end - 1]!
    result.push({
      ...last,
      id: `call-missed-group:${first.id}:${last.id}`,
      client_message_id: `call-missed-group:${first.client_message_id}:${last.client_message_id}`,
      call_id: last.call_id ?? first.call_id,
      text: `📞 ${count} cuộc gọi chưa kết nối`,
    })
    index = end
  }

  return result
}
