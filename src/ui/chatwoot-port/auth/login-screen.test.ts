import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import userMainSource from '../../../user-main.ts?raw'
import adminMainSource from '../../../admin-main.ts?raw'

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

  it('is the only production login presentation for User and Hỗ trợ', () => {
    for (const source of [userMainSource, adminMainSource]) {
      expect(source).toContain("from './ui/chatwoot-port/auth/login-screen'")
      expect(source).toContain('mountLoginScreen')
    }
    expect(userMainSource).not.toContain('user-login-form')
    expect(adminMainSource).not.toContain('admin-login-form')
  })
})
