import { pwaOwnerForPath, type PwaOwner } from './registration'

export interface OwnerWindowLike {
  url: string
  visibilityState: string
}

export function isWindowOwnedBy(client: OwnerWindowLike, owner: PwaOwner): boolean {
  try {
    return pwaOwnerForPath(new URL(client.url).pathname) === owner
  } catch {
    return false
  }
}

export function hasVisibleWindowForOwner(
  clients: readonly OwnerWindowLike[],
  owner: PwaOwner,
): boolean {
  return clients.some((client) => client.visibilityState === 'visible' && isWindowOwnedBy(client, owner))
}
