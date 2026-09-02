import type { ChatMessage } from '../../chat/messages'

const MISSED_CALL_TEXT = /^(?:Cuộc gọi đã hủy|Đã từ chối)$/i

function isMissedCallEvent(message: ChatMessage): boolean {
  return message.type === 'call' && MISSED_CALL_TEXT.test(message.text?.trim() ?? '')
}

export function compactCallTimelineMessages(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []
  let index = 0

  while (index < messages.length) {
    const first = messages[index]!
    if (!isMissedCallEvent(first)) {
      result.push(first)
      index += 1
      continue
    }

    let end = index + 1
    while (end < messages.length && isMissedCallEvent(messages[end]!)) end += 1

    const count = end - index
    if (count === 1) {
      result.push(first)
      index = end
      continue
    }

    const last = messages[end - 1]!
    result.push({
      ...last,
      id: `call-missed-group:${first.id}:${last.id}`,
      client_message_id: `call-missed-group:${first.client_message_id}:${last.client_message_id}`,
      text: `📞 ${count} cuộc gọi chưa kết nối`,
    })
    index = end
  }

  return result
}
