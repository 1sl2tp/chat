import type { MessageViewModel } from '../contracts'

export interface PresentedMessage extends MessageViewModel {
  groupWithPrevious: boolean
  groupWithNext: boolean
}

function canGroup(a: MessageViewModel | undefined, b: MessageViewModel | undefined): boolean {
  if (!a || !b) return false
  if (a.kind !== 'text' || b.kind !== 'text') return false
  if (a.direction === 'center' || b.direction === 'center') return false
  return a.direction === b.direction && Boolean(a.senderId) && a.senderId === b.senderId
}

export function presentMessages(messages: MessageViewModel[]): PresentedMessage[] {
  return messages.map((message, index) => ({
    ...message,
    groupWithPrevious: canGroup(messages[index - 1], message),
    groupWithNext: canGroup(message, messages[index + 1]),
  }))
}
