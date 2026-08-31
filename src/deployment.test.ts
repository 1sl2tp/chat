import { describe, expect, it } from 'vitest'
import { APP_BASE_PATH, PWA_APP_ID } from './deployment'

describe('custom-domain deployment', () => {
  it('serves the app from the custom-domain root', () => {
    expect(APP_BASE_PATH).toBe('/')
    expect(PWA_APP_ID).toBe('/')
  })
})
