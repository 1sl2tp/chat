export interface EnergyResult {
  averageRms: number
  peakRms: number
  samples: number
}

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export class EnergyAccumulator {
  private sum = 0
  private peak = 0
  private count = 0

  add(rms: number): void {
    if (!Number.isFinite(rms) || rms < 0) return
    this.sum += rms
    this.peak = Math.max(this.peak, rms)
    this.count += 1
  }

  result(): EnergyResult {
    return {
      averageRms: this.count ? rounded(this.sum / this.count) : 0,
      peakRms: rounded(this.peak),
      samples: this.count,
    }
  }
}

export function rmsFromSamples(samples: Float32Array): number {
  if (!samples.length) return 0
  let sum = 0
  for (const sample of samples) sum += sample * sample
  return Math.sqrt(sum / samples.length)
}

export class TrackEnergyProbe {
  private readonly accumulator = new EnergyAccumulator()
  private readonly analyser: AnalyserNode
  private readonly source: MediaStreamAudioSourceNode
  private readonly buffer: Float32Array
  private timer: number | undefined

  constructor(audioContext: AudioContext, track: MediaStreamTrack) {
    this.analyser = audioContext.createAnalyser()
    this.analyser.fftSize = 2048
    this.source = audioContext.createMediaStreamSource(new MediaStream([track]))
    this.source.connect(this.analyser)
    this.buffer = new Float32Array(this.analyser.fftSize)
  }

  start(): void {
    if (this.timer !== undefined) return
    const sample = () => {
      this.analyser.getFloatTimeDomainData(this.buffer)
      this.accumulator.add(rmsFromSamples(this.buffer))
    }
    sample()
    this.timer = window.setInterval(sample, 100)
  }

  stop(): EnergyResult {
    if (this.timer !== undefined) window.clearInterval(this.timer)
    this.timer = undefined
    try { this.source.disconnect() } catch {}
    try { this.analyser.disconnect() } catch {}
    return this.accumulator.result()
  }
}
