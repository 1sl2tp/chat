export interface StorageState {
  supported: boolean
  quota: number | null
  usage: number | null
  persisted: boolean | null
  schemaVersion: number
}

export function createStorageState(input: Partial<StorageState> = {}): StorageState {
  return {
    supported: input.supported ?? false,
    quota: input.quota ?? null,
    usage: input.usage ?? null,
    persisted: input.persisted ?? null,
    schemaVersion: input.schemaVersion ?? 1,
  }
}
