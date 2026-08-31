import { describe, expect, it } from 'vitest'
import { createMatrixRunSessionId } from './matrix-run-id'

describe('createMatrixRunSessionId', () => {
  it('returns a UUID accepted by the minimal-call RPC', () => {
    expect(createMatrixRunSessionId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })
})
