export interface LinkPreviewMetadata {
  url: string
  title: string
  description: string
  image: string
  siteName: string
}

export interface LinkPreviewFunctionInvoker {
  functions: {
    invoke(
      name: string,
      options: { body: { url: string } },
    ): Promise<{ data: unknown; error: unknown }>
  }
}

export type LinkPreviewResolver = (url: string) => Promise<LinkPreviewMetadata | null>

function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > maxLength ? `${clean.slice(0, Math.max(0, maxLength - 1))}…` : clean
}

function normalizeMetadata(data: unknown, requestedUrl: string): LinkPreviewMetadata | null {
  if (!data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  const url = cleanString(row.url, 2048) || requestedUrl
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null

  return {
    url: parsed.href,
    title: cleanString(row.title, 180),
    description: cleanString(row.description, 320),
    image: cleanString(row.image, 2048),
    siteName: cleanString(row.siteName, 100),
  }
}

export function createLinkPreviewResolver(invoker: LinkPreviewFunctionInvoker): LinkPreviewResolver {
  const cache = new Map<string, Promise<LinkPreviewMetadata | null>>()

  return (url: string) => {
    const key = url.trim()
    if (!key) return Promise.resolve(null)
    const existing = cache.get(key)
    if (existing) return existing

    const request = (async () => {
      try {
        const result = await invoker.functions.invoke('taphoaxyz-link-preview', { body: { url: key } })
        if (result.error) return null
        return normalizeMetadata(result.data, key)
      } catch {
        return null
      }
    })()

    cache.set(key, request)
    return request
  }
}
