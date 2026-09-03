import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import userShellSource from '../../../user-shell.ts?raw'
import adminShellSource from '../../../admin-shell.ts?raw'
import userCleanSource from '../../../user-clean-main.ts?raw'
import adminCleanSource from '../../../admin-clean-main.ts?raw'

const sourcePath = new URL('./login-screen.ts', import.meta.url)
const cssPath = new URL('./login-screen.css', import.meta.url)

describe('auth presentation contract', () => {
  it('keeps the previous dark LoginScreen module internally valid while it is no longer production-owned', () => {
    const source = readFileSync(sourcePath, 'utf8')
    const css = readFileSync(cssPath, 'utf8')
    expect(source).toContain('mountLoginScreen')
    expect(css).toContain('background: #020617')
    expect(css).toContain('#1f93ff')
    expect(css).not.toContain('background: #fff')
  })

  it('mounts authentication through clean User/Admin presentation owners', () => {
    expect(userShellSource).toContain("import './user-clean-main'")
    expect(adminShellSource).toContain("import './admin-clean-main'")
    expect(userCleanSource).toContain('createCleanUserUi')
    expect(userCleanSource).toContain('loginUser2')
    expect(adminCleanSource).toContain('createCleanAdminLogin')
    expect(adminCleanSource).toContain('signInAdmin')
    expect(userShellSource).not.toContain('chatwoot-login-ui')
    expect(adminShellSource).not.toContain('chatwoot-login-ui')
  })
})
