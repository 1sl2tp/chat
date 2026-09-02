import { describe, expect, it } from 'vitest'
import { createLinkPreviewResolver } from './link-preview'

describe('link preview resolver', () => {
  it('caches one Edge Function request per URL and normalizes metadata', async () => {
    let calls = 0
    const resolver = createLinkPreviewResolver({
      functions: {
        async invoke(name, options) {
          calls += 1
          expect(name).toBe('taphoaxyz-link-preview')
          expect(options.body).toEqual({ url: 'https://example.com/a' })
          return {
            error: null,
            data: {
              url: 'https://example.com/a',
              title: 'Ví dụ',
              description: 'Mô tả',
              image: 'https://example.com/og.jpg',
              siteName: 'Example',
            },
          }
        },
      },
    })

    const [first, second] = await Promise.all([
      resolver('https://example.com/a'),
      resolver('https://example.com/a'),
    ])

    expect(calls).toBe(1)
    expect(first).toEqual(second)
    expect(first?.title).toBe('Ví dụ')
    expect(first?.image).toBe('https://example.com/og.jpg')
  })

  it('returns null instead of breaking chat when unfurl fails', async () => {
    const resolver = createLinkPreviewResolver({
      functions: {
        async invoke() {
          return { error: new Error('failed'), data: null }
        },
      },
    })
    await expect(resolver('https://example.com')).resolves.toBeNull()
  })
})
