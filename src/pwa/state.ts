export type ServiceWorkerPhase = 'unsupported' | 'installing' | 'waiting' | 'active'

export interface PwaState {
  controlled: boolean
  updatePending: boolean
  phase: ServiceWorkerPhase
  swBuildId: string | null
}

export function derivePwaState(input: Partial<PwaState> = {}): PwaState {
  return {
    controlled: input.controlled ?? false,
    updatePending: input.updatePending ?? false,
    phase: input.phase ?? 'unsupported',
    swBuildId: input.swBuildId ?? null,
  }
}

export function versionsAligned(uiBuildId: string, swBuildId: string | null): boolean {
  return swBuildId === null || uiBuildId === swBuildId
}
