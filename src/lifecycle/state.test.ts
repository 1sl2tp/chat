import { describe, expect, it } from 'vitest'
import { createLifecycleState } from './state'

describe('app visibility lifecycle', () => {
  it('maps document hidden state to foreground/background', () => {
    expect(createLifecycleState(false, 10)).toEqual({ visibility: 'foreground', lastChangedAt: 10 })
    expect(createLifecycleState(true, 20)).toEqual({ visibility: 'background', lastChangedAt: 20 })
  })
})
