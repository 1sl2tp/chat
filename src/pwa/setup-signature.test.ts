import { describe, expectTypeOf, it } from 'vitest'
import { setupPwa } from '../pwa'

describe('setupPwa ownership contract', () => {
  it('returns the exact ServiceWorkerRegistration asynchronously', () => {
    expectTypeOf(setupPwa).returns.toEqualTypeOf<Promise<ServiceWorkerRegistration | null>>()
  })
})
