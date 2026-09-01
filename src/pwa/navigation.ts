export function resolveScopedNavigation(scopeHref: string, value: unknown): URL {
  const scope = new URL(scopeHref)
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return scope

  let candidate: URL

  try {
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw) || raw.startsWith('//')) {
      candidate = new URL(raw, scope)
    } else {
      let relative = raw
      const scopeLeaf = scope.pathname.split('/').filter(Boolean).at(-1)

      if (relative.startsWith('/')) {
        relative = relative.replace(/^\/+/, '')
      }

      if (
        scopeLeaf &&
        (relative === scopeLeaf ||
          relative.startsWith(`${scopeLeaf}/`) ||
          relative.startsWith(`${scopeLeaf}?`) ||
          relative.startsWith(`${scopeLeaf}#`))
      ) {
        relative = relative.slice(scopeLeaf.length).replace(/^\/+/, '')
      }

      candidate = new URL(relative || './', scope)
    }
  } catch {
    return scope
  }

  if (candidate.origin !== scope.origin || !candidate.pathname.startsWith(scope.pathname)) {
    return scope
  }

  return candidate
}
