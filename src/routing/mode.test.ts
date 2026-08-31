import { describe, expect, it } from 'vitest'
import { getAppMode } from './mode'

describe('app route mode', () => {
  it('uses Admin only for /admin', () => {
    expect(getAppMode('/admin')).toBe('admin')
    expect(getAppMode('/admin/')).toBe('admin')
  })

  it('uses User for every other path', () => {
    expect(getAppMode('/')).toBe('user')
    expect(getAppMode('/abc')).toBe('user')
    expect(getAppMode('/admin/x')).toBe('user')
  })
})
