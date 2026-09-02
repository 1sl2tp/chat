import { describe, expect, it } from 'vitest'
import { APP_RELEASE, releaseBadgeText } from './release'

describe('visible release label', () => {
  it('exposes the current product release independently of package.json', () => {
    expect(APP_RELEASE).toBe('0.17.5')
  })

  it('includes a short build id so device cache can be verified', () => {
    expect(releaseBadgeText('ba18a96669b7236f292f9acc190b992f1381c9c9'))
      .toBe('v0.17.5 · ba18a96')
  })

  it('keeps local builds recognizable', () => {
    expect(releaseBadgeText('local')).toBe('v0.17.5 · local')
  })
})
