import { describe, expect, it } from 'vitest'
import { MINIMAL_CALL_TEST_VERSION, minimalCallVersionLabel } from './version-label'

describe('minimalCallVersionLabel', () => {
  it('exposes the v1.7 permission gesture test version', () => {
    expect(MINIMAL_CALL_TEST_VERSION).toBe('minimal-call-v1.7-permission-gesture')
  })

  it('shows test version and short build SHA', () => {
    expect(minimalCallVersionLabel('minimal-call-v1.7-permission-gesture', 'e2af638e36741657914b3581d56b82ede6f9db3a'))
      .toBe('v1.7 · build e2af638')
  })

  it('still shows the test version when build id is unavailable', () => {
    expect(minimalCallVersionLabel('minimal-call-v1.7-permission-gesture', ''))
      .toBe('v1.7 · build local')
  })
})
