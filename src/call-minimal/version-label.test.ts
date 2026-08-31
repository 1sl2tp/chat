import { describe, expect, it } from 'vitest'
import { MINIMAL_CALL_TEST_VERSION, minimalCallVersionLabel } from './version-label'

describe('minimalCallVersionLabel', () => {
  it('exposes the v1.5 auto matrix test version', () => {
    expect(MINIMAL_CALL_TEST_VERSION).toBe('minimal-call-v1.5-auto-matrix')
  })

  it('shows test version and short build SHA', () => {
    expect(minimalCallVersionLabel('minimal-call-v1.5-auto-matrix', 'e2af638e36741657914b3581d56b82ede6f9db3a'))
      .toBe('v1.5 · build e2af638')
  })

  it('still shows the test version when build id is unavailable', () => {
    expect(minimalCallVersionLabel('minimal-call-v1.5-auto-matrix', ''))
      .toBe('v1.5 · build local')
  })
})
