import { describe, expect, it } from 'vitest'
import { APP_BASE_PATH, PWA_APP_ID } from './deployment'

describe('deployment', () => {
  it('uses one relative build for custom and project-base hosting', () => {
    expect(APP_BASE_PATH).toBe('./')
    expect(PWA_APP_ID).toBe('./')
  })
})
