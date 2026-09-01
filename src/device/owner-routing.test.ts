import { describe, expect, it } from 'vitest'
import { deviceOwnerForPath } from './identity'

describe('device owner routing', () => {
  it('keeps Admin and root User device namespaces separate by page path', () => {
    expect(deviceOwnerForPath('/admin/')).toBe('admin')
    expect(deviceOwnerForPath('/admin/index.html')).toBe('admin')
    expect(deviceOwnerForPath('/chat/admin/')).toBe('admin')
    expect(deviceOwnerForPath('/chat/admin/index.html')).toBe('admin')
    expect(deviceOwnerForPath('/')).toBe('user2')
    expect(deviceOwnerForPath('/index.html')).toBe('user2')
    expect(deviceOwnerForPath('/chat/')).toBe('user2')
  })
})
