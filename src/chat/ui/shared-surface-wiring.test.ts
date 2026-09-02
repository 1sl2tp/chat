import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import userMainSource from '../../user-main.ts?raw'
import adminMainSource from '../../admin-main.ts?raw'

const userCssSource = readFileSync(new URL('../../user.css', import.meta.url), 'utf8')
const adminCssSource = readFileSync(new URL('../../admin.css', import.meta.url), 'utf8')

describe('shared User/Admin chat surface wiring', () => {
  it('routes both shells through the shared composer behavior', () => {
    expect(userMainSource).toContain("from './chat/ui/composer-behavior'")
    expect(adminMainSource).toContain("from './chat/ui/composer-behavior'")
    expect(userMainSource).toContain('composerEnterAction')
    expect(adminMainSource).toContain('composerEnterAction')
  })

  it('installs the same viewport owner for User and Admin', () => {
    expect(userMainSource).toContain('setupViewportController()')
    expect(adminMainSource).toContain('setupViewportController()')
  })

  it('uses visual viewport height and a 16px textarea in both shells', () => {
    for (const source of [userCssSource, adminCssSource]) {
      expect(source).toContain('var(--app-visual-height,100dvh)')
      expect(source).toContain('.composer textarea')
      expect(source).toContain('font-size:16px')
    }
  })
})
