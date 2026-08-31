import { describe, expect, it } from 'vitest'
import { createStorageState } from './state'

describe('storage state', () => {
  it('tracks quota, usage, persistence and schema version', () => {
    expect(createStorageState({ supported: true, quota: 1000, usage: 250, persisted: true, schemaVersion: 2 })).toEqual({
      supported: true,
      quota: 1000,
      usage: 250,
      persisted: true,
      schemaVersion: 2,
    })
  })
})
