import { describe, expect, it } from 'vitest'
import userMainSource from '../user-main.ts?raw'

describe('User-facing support copy', () => {
  it('shows Hỗ trợ instead of the technical Admin role', () => {
    expect(userMainSource).toContain('<strong>Hỗ trợ</strong>')
    expect(userMainSource).toContain('aria-label="Tin nhắn với Hỗ trợ"')
    expect(userMainSource).toContain("peerName: 'Hỗ trợ'")
    expect(userMainSource).not.toContain('Admin hỗ trợ')
    expect(userMainSource).not.toContain('Tin nhắn với Admin')
    expect(userMainSource).not.toContain('admin?.display_name')
  })
})
