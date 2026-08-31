export type AppVisibility = 'foreground' | 'background'

export interface LifecycleState {
  visibility: AppVisibility
  lastChangedAt: number
}

export function createLifecycleState(hidden: boolean, now: number): LifecycleState {
  return {
    visibility: hidden ? 'background' : 'foreground',
    lastChangedAt: now,
  }
}
