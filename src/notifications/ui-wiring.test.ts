import { describe, expect, it } from 'vitest'
import userSource from '../user-main.ts?raw'
import adminSource from '../admin-main.ts?raw'

for (const [name, source] of [['User', userSource], ['Admin', adminSource]] as const) {
  describe(`${name} notification UI wiring`, () => {
    it('uses the shared readiness presentation and exposes re-test', () => {
      expect(source).toContain('notificationButtonPresentation')
      expect(source).toContain('getIssue()')
      expect(source).toContain('testFromUserGesture()')
      expect(source).toContain('enableFromUserGesture()')
    })

    it('primes incoming alert audio from the explicit notification user gesture', () => {
      expect(source).toContain('prepareAlertAudioFromUserGesture()')
    })
  })
}
