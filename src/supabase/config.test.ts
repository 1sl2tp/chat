import { describe, expect, it } from 'vitest'
import { createSupabaseConfig } from './config'

describe('Supabase browser config', () => {
  it('accepts only a project URL and publishable key', () => {
    expect(createSupabaseConfig('https://example.supabase.co', 'sb_publishable_test')).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_test',
    })
  })

  it('fails closed when configuration is missing', () => {
    expect(() => createSupabaseConfig('', '')).toThrow('Missing Supabase browser configuration')
  })
})
