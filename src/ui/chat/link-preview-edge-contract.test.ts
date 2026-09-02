/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../../../supabase/functions/taphoaxyz-link-preview/index.ts', import.meta.url),
  'utf8',
)

describe('link preview edge contract', () => {
  it('accepts only http(s), blocks private targets and follows redirects manually', () => {
    expect(source).toContain("url.protocol !== 'http:' && url.protocol !== 'https:'")
    expect(source).toContain('isPrivateHostname')
    expect(source).toContain("redirect: 'manual'")
    expect(source).toContain('MAX_REDIRECTS')
  })

  it('returns OpenGraph-style metadata without storing it in the database', () => {
    expect(source).toContain("property === 'og:title'")
    expect(source).toContain("property === 'og:description'")
    expect(source).toContain("property === 'og:image'")
    expect(source).toContain("property === 'og:site_name'")
    expect(source).toContain('siteName')
  })
})
