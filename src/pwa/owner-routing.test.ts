import { describe, expect, it } from 'vitest'
import { pwaOwnerForPath } from './registration'

describe('PWA owner routing', () => {
  it('routes Admin pages to the narrower Admin service worker scope', () => {
    expect(pwaOwnerForPath('/admin/')).toBe('admin')
    expect(pwaOwnerForPath('/admin/index.html')).toBe('admin')
    expect(pwaOwnerForPath('/')).toBe('user')
  })
})
