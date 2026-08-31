import { describe, expect, it } from 'vitest'
import { MinimalCallLifecycle } from './owner-lifecycle'

describe('MinimalCallLifecycle', () => {
  it('allows exactly one join and one leave lifecycle', () => {
    const lifecycle = new MinimalCallLifecycle()
    expect(lifecycle.phase).toBe('idle')
    lifecycle.beginJoin()
    expect(lifecycle.phase).toBe('joining')
    lifecycle.markConnected()
    expect(lifecycle.phase).toBe('connected')
    lifecycle.beginLeave()
    expect(lifecycle.phase).toBe('leaving')
    lifecycle.markEnded()
    expect(lifecycle.phase).toBe('ended')
  })

  it('rejects a second join while a call is active', () => {
    const lifecycle = new MinimalCallLifecycle()
    lifecycle.beginJoin()
    expect(() => lifecycle.beginJoin()).toThrow('call_already_active')
  })

  it('records terminal errors', () => {
    const lifecycle = new MinimalCallLifecycle()
    lifecycle.beginJoin()
    lifecycle.markError()
    expect(lifecycle.phase).toBe('error')
  })
})
