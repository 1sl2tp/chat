import { describe, expect, it } from 'vitest'
import { EnergyAccumulator } from './matrix-energy'

describe('EnergyAccumulator', () => {
  it('tracks peak and average RMS across samples', () => {
    const energy = new EnergyAccumulator()
    energy.add(0.01)
    energy.add(0.03)
    energy.add(0.02)
    expect(energy.result()).toEqual({ averageRms: 0.02, peakRms: 0.03, samples: 3 })
  })

  it('returns zero values before samples arrive', () => {
    expect(new EnergyAccumulator().result()).toEqual({ averageRms: 0, peakRms: 0, samples: 0 })
  })
})
