import { describe, expect, it } from 'vitest'
import { buildLabel } from './build-label'

describe('visible build label', () => {
  it('shows a compact eight-character build id', () => {
    expect(buildLabel('4232ed5f66122fc5a8e28a3a67c612ad00d5a878')).toBe('4232ed5f')
  })

  it('falls back to dev when no build id is available', () => {
    expect(buildLabel('')).toBe('dev')
    expect(buildLabel(undefined)).toBe('dev')
  })
})
