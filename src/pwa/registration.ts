export type PwaOwner = 'user' | 'admin'

export interface PwaRegistrationDescriptor {
  scriptUrl: string
  scope: string
}

export function pwaRegistrationDescriptor(owner: PwaOwner): PwaRegistrationDescriptor {
  return owner === 'admin'
    ? { scriptUrl: '/sw.js', scope: '/admin/' }
    : { scriptUrl: '/sw.js', scope: '/' }
}
