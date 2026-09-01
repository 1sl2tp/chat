import { describe, expect, it, vi } from 'vitest'
import { enterFreshGuest } from './root-session'

describe('fresh guest entry', () => {
  it('ends any surviving guest before starting a new guest chat', async () => {
    const events: string[] = []

    await enterFreshGuest({
      endGuest: vi.fn(async () => { events.push('end') }),
      startGuest: vi.fn(async () => { events.push('start') }),
    })

    expect(events).toEqual(['end', 'start'])
  })
})
