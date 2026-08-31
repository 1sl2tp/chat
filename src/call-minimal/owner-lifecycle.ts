export type MinimalCallPhase = 'idle' | 'joining' | 'connected' | 'leaving' | 'ended' | 'error'

export class MinimalCallLifecycle {
  phase: MinimalCallPhase = 'idle'

  beginJoin(): void {
    if (this.phase !== 'idle' && this.phase !== 'ended' && this.phase !== 'error') {
      throw new Error('call_already_active')
    }
    this.phase = 'joining'
  }

  markConnected(): void {
    if (this.phase !== 'joining') throw new Error('invalid_call_phase')
    this.phase = 'connected'
  }

  beginLeave(): void {
    if (this.phase !== 'connected' && this.phase !== 'joining') return
    this.phase = 'leaving'
  }

  markEnded(): void {
    this.phase = 'ended'
  }

  markError(): void {
    this.phase = 'error'
  }
}
