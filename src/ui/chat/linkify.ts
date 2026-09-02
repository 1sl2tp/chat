const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi
const TRAILING_PUNCTUATION = /[.,!?;:)\]}]+$/

export function normalizeHttpUrl(candidate: string): string | null {
  const trimmed = candidate.replace(TRAILING_PUNCTUATION, '')
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

export function extractHttpUrls(text: string): string[] {
  const results: string[] = []
  for (const match of text.matchAll(URL_PATTERN)) {
    const normalized = normalizeHttpUrl(match[0])
    if (normalized) results.push(normalized)
  }
  return results
}
