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

function cleanHttpUrl(value: unknown, fallback = ''): string {
  const raw = cleanString(value, 2048) || fallback
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : ''
  } catch {
    return ''
  }
}

function normalizeMetadata(data: unknown, requestedUrl: string): LinkPreviewMetadata | null {
  if (!data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  const url = cleanHttpUrl(row.url, requestedUrl)
  if (!url) return null

  return {
    url,
    title: cleanString(row.title, 180),
    description: cleanString(row.description, 320),
    image: cleanHttpUrl(row.image),
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

let guestResolver: LinkPreviewResolver | null = null
let userResolver: LinkPreviewResolver | null = null
let adminResolver: LinkPreviewResolver | null = null

export const resolveActiveLinkPreview: LinkPreviewResolver = async (url) => {
  const { adminSupabase, guestSupabase, userSupabase } = await import('../../supabase/client')
  const pathname = typeof location === 'undefined' ? '' : location.pathname
  if (/(?:^|\/)admin(?:\/|$)/.test(pathname)) {
    adminResolver ??= createLinkPreviewResolver(adminSupabase)
    return adminResolver(url)
  }

  const persistentSession = await userSupabase.auth.getSession()
  if (persistentSession.data.session) {
    userResolver ??= createLinkPreviewResolver(userSupabase)
    return userResolver(url)
  }

  guestResolver ??= createLinkPreviewResolver(guestSupabase)
  return guestResolver(url)
}
