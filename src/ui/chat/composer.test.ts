import { describe, expect, it } from 'vitest'
import { normalizeDraft } from './composer'

describe('composer draft', () => {
  it('trims outer whitespace before send', () => {
    expect(normalizeDraft('  xin chào  ')).toBe('xin chào')
  })

  it('treats whitespace-only input as empty', () => {
    expect(normalizeDraft('   \n ')).toBe('')
  })
})
