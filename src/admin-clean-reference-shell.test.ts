import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const ui = fs.readFileSync('src/ui/clean/admin/admin-ui.ts', 'utf8')
const css = fs.readFileSync('src/ui/clean/admin/admin.css', 'utf8')

describe('active clean Admin shell follows the approved desktop reference', () => {
  it('owns a persistent desktop workspace with inbox, chat, and CRM siblings', () => {
    expect(ui).toContain('clean-admin__workspace')
    expect(ui).toContain('clean-admin__inbox')
    expect(ui).toContain('clean-admin__chat-panel')
    expect(ui).toContain('clean-admin__crm')
    expect(css).toContain('grid-template-columns:320px minmax(0,1fr) 320px')
  })

  it('keeps mobile navigation as one screen at a time instead of forcing desktop columns', () => {
    expect(ui).toContain('data-selected')
    expect(css).toContain('@media(max-width:759px)')
    expect(css).toContain('.clean-admin[data-selected="true"] .clean-admin__inbox')
  })

  it('does not alter the runtime owner used by /admin', () => {
    const entry = fs.readFileSync('src/admin-shell.ts', 'utf8')
    expect(entry).toContain("import './admin-clean-main'")
  })
})
