export type AppMode = 'admin' | 'user'

export function getAppMode(pathname: string): AppMode {
  return pathname === '/admin' || pathname === '/admin/' ? 'admin' : 'user'
}
