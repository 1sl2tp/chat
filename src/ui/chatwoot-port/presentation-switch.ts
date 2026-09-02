export type ChatPresentation = 'legacy' | 'chatwoot-port'

let presentation: ChatPresentation = 'chatwoot-port'

export function getChatPresentation(): ChatPresentation {
  return presentation
}

export function setChatPresentation(next: ChatPresentation): void {
  presentation = next
}
