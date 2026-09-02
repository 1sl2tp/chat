import { describe, expect, it } from 'vitest'
import { extractHttpUrls } from './linkify'

describe('chat linkify', () => {
  it('extracts only http/https URLs', () => {
    expect(extractHttpUrls('Xem https://taphoa.xyz/a và http://example.com')).toEqual([
      'https://taphoa.xyz/a',
      'http://example.com/',
    ])
    expect(extractHttpUrls('javascript:alert(1)')).toEqual([])
  })

  it('drops trailing chat punctuation from the URL', () => {
    expect(extractHttpUrls('Mở https://example.com/test.')).toEqual(['https://example.com/test'])
  })
})
