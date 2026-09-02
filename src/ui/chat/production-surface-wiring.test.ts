import { describe, expect, it } from 'vitest'
import userMainSource from '../../user-main.ts?raw'
import adminMainSource from '../../admin-main.ts?raw'

describe('production shared conversation surface', () => {
  it('mounts the same surface from User and Admin shells', () => {
    expect(userMainSource).toContain("from './ui/chat/surface'")
    expect(adminMainSource).toContain("from './ui/chat/surface'")
    expect(userMainSource).toContain('mountConversationSurface')
    expect(adminMainSource).toContain('mountConversationSurface')
  })

  it('does not keep shell-local message bubble render loops', () => {
    expect(userMainSource).not.toContain("row.className = message.sender_id")
    expect(adminMainSource).not.toContain("row.className = message.sender_id")
  })
})
