import { describe, expect, it } from 'vitest'
import { getAppLabel } from './app'

describe('app foundation', () => {
  it('keeps the deployment probe label as TEST', () => {
    expect(getAppLabel()).toBe('TEST')
  })
})
