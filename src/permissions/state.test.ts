import { describe, expect, it } from 'vitest'
import { derivePermissionState, shouldRequestPermission } from './state'

describe('permission ownership', () => {
  it('maps browser permission values into one app permission contract', () => {
    expect(derivePermissionState('granted')).toBe('granted')
    expect(derivePermissionState('denied')).toBe('denied')
    expect(derivePermissionState('prompt')).toBe('prompt')
    expect(derivePermissionState('default')).toBe('prompt')
    expect(derivePermissionState(undefined)).toBe('unknown')
  })

  it('requests only when a supported permission still needs a user decision', () => {
    expect(shouldRequestPermission('prompt', true)).toBe(true)
    expect(shouldRequestPermission('granted', true)).toBe(false)
    expect(shouldRequestPermission('denied', true)).toBe(false)
    expect(shouldRequestPermission('prompt', false)).toBe(false)
  })
})
