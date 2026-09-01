import { describe, expect, it } from 'vitest'
import swSource from '../sw.ts?raw'

describe('service-worker notification navigation wiring', () => {
  it('uses the scoped navigation resolver for notification clicks', () => {
    expect(swSource).toContain("import { resolveScopedNavigation } from './pwa/navigation'")
    expect(swSource).toContain('resolveScopedNavigation(self.registration.scope, data?.navigate)')
    expect(swSource).not.toContain('function resolveSafeNavigation')
  })
})
