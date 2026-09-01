export type PwaOwner = 'user' | 'admin'

export interface PwaRegistrationDescriptor {
  scriptUrl: string
  scope: string
}

export function pwaOwnerForPath(pathname: string): PwaOwner {
  return pathname === '/admin' || pathname.startsWith('/admin/') ? 'admin' : 'user'
}

export function pwaRegistrationDescriptor(owner: PwaOwner): PwaRegistrationDescriptor {
  return owner === 'admin'
    ? { scriptUrl: '/sw.js', scope: '/admin/' }
    : { scriptUrl: '/sw.js', scope: '/' }
}
