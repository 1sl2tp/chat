import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const MAX_REDIRECTS = 3
const MAX_BYTES = 262_144
const FETCH_TIMEOUT_MS = 6_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function cleanText(value: string, maxLength: number): string {
  const clean = value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.length > maxLength ? `${clean.slice(0, Math.max(0, maxLength - 1))}…` : clean
}

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.')
  if (parts.length !== 4) return null
  const numbers = parts.map((part) => Number(part))
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return numbers
}

function isPrivateIpv4(parts: number[]): boolean {
  const [a, b] = parts
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a >= 224
}

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
  const ipv4 = parseIpv4(host)
  if (ipv4) return isPrivateIpv4(ipv4)
  if (host.includes(':')) {
    return host === '::1'
      || host === '::'
      || /^f[cd][0-9a-f]{2}:/i.test(host)
      || /^fe[89ab][0-9a-f]:/i.test(host)
  }
  return false
}

function parseHttpUrl(raw: string, base?: URL): URL | null {
  try {
    const url = base ? new URL(raw, base) : new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password || isPrivateHostname(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {}
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  for (const match of tag.matchAll(pattern)) {
    result[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return result
}

function metadataFromHtml(html: string, finalUrl: URL) {
  const meta = new Map<string, string>()
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0])
    const property = (attrs.property || attrs.name || '').toLowerCase()
    const content = attrs.content || ''
    if (!property || !content) continue
    if (property === 'og:title') meta.set('og:title', content)
    if (property === 'og:description') meta.set('og:description', content)
    if (property === 'og:image') meta.set('og:image', content)
    if (property === 'og:site_name') meta.set('og:site_name', content)
    if (property === 'og:url') meta.set('og:url', content)
    if (property === 'twitter:title') meta.set('twitter:title', content)
    if (property === 'twitter:description') meta.set('twitter:description', content)
    if (property === 'twitter:image') meta.set('twitter:image', content)
    if (property === 'description') meta.set('description', content)
  }

  let canonical = ''
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(match[0])
    if ((attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical')) {
      canonical = attrs.href || ''
      break
    }
  }

  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
  const resolvedUrl = parseHttpUrl(meta.get('og:url') || canonical, finalUrl)?.href || finalUrl.href
  const image = parseHttpUrl(meta.get('og:image') || meta.get('twitter:image') || '', finalUrl)?.href || ''

  return {
    url: resolvedUrl,
    title: cleanText(meta.get('og:title') || meta.get('twitter:title') || titleTag, 180),
    description: cleanText(meta.get('og:description') || meta.get('twitter:description') || meta.get('description') || '', 320),
    image,
    siteName: cleanText(meta.get('og:site_name') || finalUrl.hostname.replace(/^www\./, ''), 100),
  }
}

async function readLimitedText(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  try {
    while (total < MAX_BYTES) {
      const { value, done } = await reader.read()
      if (done || !value) break
      const remaining = MAX_BYTES - total
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value
      total += chunk.byteLength
      text += decoder.decode(chunk, { stream: total < MAX_BYTES })
      if (value.byteLength > remaining) break
    }
    text += decoder.decode()
    return text
  } finally {
    await reader.cancel().catch(() => {})
  }
}

async function fetchHtml(start: URL): Promise<{ response: Response; url: URL }> {
  let current = start
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (isPrivateHostname(current.hostname)) throw new Error('private_target')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'User-Agent': 'Mozilla/5.0 (compatible; TAPHOA-LinkPreview/1.0)',
        },
      })
    } finally {
      clearTimeout(timer)
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects >= MAX_REDIRECTS) throw new Error('too_many_redirects')
      const location = response.headers.get('location')
      const next = location ? parseHttpUrl(location, current) : null
      if (!next) throw new Error('unsafe_redirect')
      current = next
      continue
    }

    if (!response.ok) throw new Error(`upstream_${response.status}`)
    const type = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) throw new Error('not_html')
    return { response, url: current }
  }
  throw new Error('redirect_loop')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const body = await req.json().catch(() => null) as { url?: unknown } | null
    if (!body || typeof body.url !== 'string' || body.url.length > 2048) return json({ error: 'invalid_url' }, 400)
    const url = parseHttpUrl(body.url.trim())
    if (!url) return json({ error: 'invalid_url' }, 400)

    const { response, url: finalUrl } = await fetchHtml(url)
    const html = await readLimitedText(response)
    return json(metadataFromHtml(html, finalUrl))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'preview_failed'
    return json({ error: message }, 422)
  }
})
