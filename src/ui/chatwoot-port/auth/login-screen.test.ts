import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import userShellSource from '../../../user-shell.ts?raw'
import adminShellSource from '../../../admin-shell.ts?raw'
import userAdapterSource from '../../../user/chatwoot-login-ui.ts?raw'
import adminAdapterSource from '../../../admin/chatwoot-login-ui.ts?raw'

const sourcePath = new URL('./login-screen.ts', import.meta.url)
const cssPath = new URL('./login-screen.css', import.meta.url)

describe('Chatwoot LoginScreen production contract', () => {
  it('ports the canonical Chatwoot auth hierarchy into one browser owner', () => {
    const source = readFileSync(sourcePath, 'utf8')
    const css = readFileSync(cssPath, 'utf8')
    expect(source).toContain('cw-login__logo')
    expect(source).toContain('cw-login__title')
    expect(source).toContain('cw-login__field')
    expect(source).toContain('cw-login__password-toggle')
    expect(source).toContain('mountLoginScreen')
    expect(css).toContain('padding: 96px 24px 32px')
    expect(css).toContain('font-size: 16px')
  })

  it('is mounted through one shared LoginScreen owner while auth runtime keeps its existing controls', () => {
    expect(userShellSource).toContain("from './user/chatwoot-login-ui'")
    expect(userShellSource).toContain('mountUserChatwootLoginUi()')
    expect(adminShellSource).toContain("from './admin/chatwoot-login-ui'")
    expect(adminShellSource).toContain('installAdminChatwootLoginUi()')

    for (const source of [userAdapterSource, adminAdapterSource]) {
      expect(source).toContain("from '../ui/chatwoot-port/auth/login-screen'")
      expect(source).toContain('mountLoginScreen({')
    }
  })
})
