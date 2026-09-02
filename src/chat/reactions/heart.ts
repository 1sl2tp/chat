export const HEART_REACTION = '❤️' as const

export function nextHeartReaction(current: string | null | undefined): typeof HEART_REACTION | null {
  return current === HEART_REACTION ? null : HEART_REACTION
}
