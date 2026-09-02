import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync('src/admin-main.ts', 'utf8')
const css = fs.readFileSync('src/admin.css', 'utf8')

describe('approved reference Admin workspace', () => {
  it('owns the real compact TAPHOA support workspace surfaces', () => {
    expect(source).toContain('admin-topbar')
    expect(source).toContain('admin-workspace')
    expect(source).toContain('admin-inbox')
    expect(source).toContain('admin-chat')
    expect(source).toContain('admin-account-menu')
    expect(source).toContain('call-notifications')
    expect(source).toContain('voice-call-host')
    expect(source).toMatch(/TAPHOA|Tạp Hóa XYZ/)
  })

  it('does not copy enterprise destinations that TAPHOA does not support', () => {
    expect(source).not.toContain('Báo cáo')
    expect(source).not.toContain('Automation')
    expect(source).not.toContain('Quản lý Nhân Viên')
  })

  it('uses the approved dark reference workspace ownership', () => {
    expect(css).toContain('background:#020617')
    expect(css).toContain('background:#0f172a')
    expect(css).toContain('border-color:#1e293b')
  })
})
