export type PwaOwner = 'user' | 'admin'

export interface PwaRegistrationDescriptor {
  scriptUrl: string
  scope: string
}

export function pwaOwnerForPath(pathname: string): PwaOwner {
  const normalized = normalizePathname(pathname)
  return normalized === '/admin'
    || normalized.endsWith('/admin')
    || normalized.includes('/admin/')
    ? 'admin'
    : 'user'
}

export function pwaRegistrationDescriptor(
  owner: PwaOwner,
  pathname = '/',
): PwaRegistrationDescriptor {
  const appRoot = appRootForPath(pathname, owner)
  return owner === 'admin'
    ? { scriptUrl: `${appRoot}sw.js`, scope: `${appRoot}admin/` }
    : { scriptUrl: `${appRoot}sw.js`, scope: appRoot }
}

function appRootForPath(pathname: string, owner: PwaOwner): string {
  let normalized = normalizePathname(pathname)

  if (owner === 'admin') {
    const marker = normalized.indexOf('/admin')
    if (marker >= 0) return ensureTrailingSlash(normalized.slice(0, marker) || '/')
    return '/'
  }

  if (normalized.endsWith('/index.html')) {
    normalized = normalized.slice(0, -'index.html'.length)
  }

  return ensureTrailingSlash(normalized)
}

function normalizePathname(pathname: string): string {
  const value = pathname.trim() || '/'
  return (`/${value}`).replace(/\/+/g, '/')
}

function ensureTrailingSlash(pathname: string): string {
  return pathname.endsWith('/') ? pathname : `${pathname}/`
}
