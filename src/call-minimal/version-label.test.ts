import { describe, expect, it } from 'vitest'
import { minimalCallVersionLabel } from './version-label'

describe('minimalCallVersionLabel', () => {
  it('shows test version and short build SHA', () => {
    expect(minimalCallVersionLabel('minimal-call-v1.3-ios-audio-session', 'e2af638e36741657914b3581d56b82ede6f9db3a'))
      .toBe('v1.3 · build e2af638')
  })

  it('still shows the test version when build id is unavailable', () => {
    expect(minimalCallVersionLabel('minimal-call-v1.3-ios-audio-session', ''))
      .toBe('v1.3 · build local')
  })
})
