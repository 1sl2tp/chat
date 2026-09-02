import type { VoiceCallState } from './voice-session'

export type CallAlertMode = 'silent' | 'incoming' | 'ringback'

export interface CallAlertAudio {
  arm(): void
  startIncoming(): void
  startRingback(): void
  stop(): void
}

export interface CallAlertVibration {
  start(): void
  stop(): void
}

export class CallAlertController {
  private mode: CallAlertMode = 'silent'
  private readonly audio: CallAlertAudio
  private readonly vibration: CallAlertVibration

  constructor(
    audio: CallAlertAudio = new BrowserCallAlertAudio(),
    vibration: CallAlertVibration = new BrowserCallAlertVibration(),
  ) {
    this.audio = audio
    this.vibration = vibration
  }

  armAfterMicrophoneGesture(): void {
    try {
      this.audio.arm()
    } catch {
      // Alert audio is optional and must never affect the call path.
    }
  }

  sync(state: VoiceCallState): void {
    const nextMode: CallAlertMode = state.resumeRequired
      ? 'silent'
      : state.phase === 'incoming'
        ? 'incoming'
        : state.phase === 'outgoing'
          ? 'ringback'
          : 'silent'

    if (nextMode === this.mode) return
    this.stopCurrent()
    this.mode = nextMode

    if (nextMode === 'incoming') {
      try { this.audio.startIncoming() } catch { /* best effort */ }
      try { this.vibration.start() } catch { /* best effort */ }
      return
    }

    if (nextMode === 'ringback') {
      try { this.audio.startRingback() } catch { /* best effort */ }
    }
  }

  stop(): void {
    this.mode = 'silent'
    this.stopCurrent()
  }

  private stopCurrent(): void {
    try { this.audio.stop() } catch { /* best effort */ }
    try { this.vibration.stop() } catch { /* best effort */ }
  }
}

export class BrowserCallAlertAudio implements CallAlertAudio {
  private context: AudioContext | null = null
  private timers = new Set<number>()
  private generation = 0

  arm(): void {
    const context = this.ensureContext()
    if (!context) return
    if (context.state === 'suspended') void context.resume().catch(() => undefined)

    // A real, silent start during an explicit user gesture is more reliable on
    // mobile browsers than resume() alone for allowing a later incoming ring.
    try {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      gain.gain.value = 0
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start()
      oscillator.stop(context.currentTime + 0.01)
      oscillator.addEventListener('ended', () => {
        oscillator.disconnect()
        gain.disconnect()
      }, { once: true })
    } catch {
      // Priming is best effort and must never block chat/call setup.
    }
  }

  startIncoming(): void {
    this.startPattern([
      { at: 0, duration: 220, frequency: 440 },
      { at: 340, duration: 220, frequency: 520 },
    ], 1500)
  }

  startRingback(): void {
    this.startPattern([
      { at: 0, duration: 620, frequency: 440 },
    ], 2100)
  }

  stop(): void {
    this.generation += 1
    for (const timer of this.timers) window.clearTimeout(timer)
    this.timers.clear()
  }

  private startPattern(
    tones: Array<{ at: number; duration: number; frequency: number }>,
    repeatMs: number,
  ): void {
    this.stop()
    const generation = this.generation
    const scheduleCycle = (): void => {
      if (generation !== this.generation) return
      for (const tone of tones) {
        this.schedule(() => this.playTone(tone.duration, tone.frequency, generation), tone.at, generation)
      }
      this.schedule(scheduleCycle, repeatMs, generation)
    }
    scheduleCycle()
  }

  private schedule(action: () => void, delayMs: number, generation: number): void {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer)
      if (generation === this.generation) action()
    }, delayMs)
    this.timers.add(timer)
  }

  private playTone(durationMs: number, frequency: number, generation: number): void {
    if (generation !== this.generation) return
    const context = this.ensureContext()
    if (!context) return
    if (context.state === 'suspended') void context.resume().catch(() => undefined)

    try {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.value = 0.055
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start()
      oscillator.stop(context.currentTime + durationMs / 1000)
      oscillator.addEventListener('ended', () => {
        oscillator.disconnect()
        gain.disconnect()
      }, { once: true })
    } catch {
      // Web Audio is a capability enhancement only.
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context
    const AudioContextCtor = window.AudioContext
    if (!AudioContextCtor) return null
    try {
      this.context = new AudioContextCtor()
      return this.context
    } catch {
      return null
    }
  }
}

class BrowserCallAlertVibration implements CallAlertVibration {
  private timer: number | null = null
  private readonly pattern = [350, 180, 350, 900]

  start(): void {
    this.stop()
    if (typeof navigator.vibrate !== 'function') return
    const vibrate = (): void => {
      try { navigator.vibrate(this.pattern) } catch { /* best effort */ }
    }
    vibrate()
    this.timer = window.setInterval(vibrate, 1780)
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    if (typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(0) } catch { /* best effort */ }
    }
  }
}
