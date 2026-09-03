import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const userShell = fs.readFileSync('src/user-shell.ts', 'utf8')
const adminShell = fs.readFileSync('src/admin-shell.ts', 'utf8')

const forbiddenUserImports = [
  "./ui/reference.css",
  "./user-main",
  "./user/account-ui.css",
  "./ui/chatwoot-port/account/account.css",
  "./user/chatwoot-account-ui",
  "./user/chatwoot-login-ui",
]

const forbiddenAdminImports = [
  "./ui/reference.css",
  "./admin-main",
  "./admin/management-ui.css",
  "./ui/chatwoot-port/inbox/inbox.css",
  "./admin/reference-shell-ui",
  "./admin/chatwoot-management-ui",
  "./admin/chatwoot-login-ui",
]

describe('clean UI production cutover', () => {
  it('routes User through the clean presentation root only', () => {
    expect(userShell).toContain("import './ui/clean/theme.css'")
    expect(userShell).toContain("import './user-clean-main'")
    for (const legacyImport of forbiddenUserImports) expect(userShell).not.toContain(legacyImport)
  })

  it('routes Admin through the clean presentation root only', () => {
    expect(adminShell).toContain("import './ui/clean/theme.css'")
    expect(adminShell).toContain("import './admin-clean-main'")
    for (const legacyImport of forbiddenAdminImports) expect(adminShell).not.toContain(legacyImport)
  })
})
