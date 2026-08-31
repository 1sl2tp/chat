export function shouldLeadMatrix(localIdentity: string, remoteIdentity: string): boolean {
  return localIdentity.localeCompare(remoteIdentity) < 0
}

export function matrixRunKey(id: string): string {
  return `v15-${id}`
}
