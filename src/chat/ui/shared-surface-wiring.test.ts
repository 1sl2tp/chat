import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import userMainSource from '../../user-main.ts?raw'
import adminMainSource from '../../admin-main.ts?raw'
import composerSource from '../../ui/chat/composer.ts?raw'

const userCssSource = readFileSync(new URL('../../user.css', import.meta.url), 'utf8')
const adminCssSource = readFileSync(new URL('../../admin.css', import.meta.url), 'utf8')
const surfaceCssSource = readFileSync(new URL('../../ui/chat/surface.css', import.meta.url), 'utf8')

describe('shared User/Admin chat surface wiring', () => {
  it('owns composer keyboard behavior in one shared component', () => {
    expect(composerSource).toContain("from '../../chat/ui/composer-behavior'")
    expect(composerSource).toContain('composerEnterAction')
    expect(userMainSource).toContain("from './ui/chat/surface'")
    expect(adminMainSource).toContain("from './ui/chat/surface'")
  })

  it('installs the same viewport owner for User and Admin', () => {
    expect(userMainSource).toContain('setupViewportController()')
    expect(adminMainSource).toContain('setupViewportController()')
  })

  it('keeps both shells on visual viewport and the shared textarea at 16px', () => {
    for (const source of [userCssSource, adminCssSource]) {
      expect(source).toContain('var(--app-visual-height,100dvh)')
    }
    expect(userMainSource).toContain("import './ui/chat/surface.css'")
    expect(adminMainSource).toContain("import './ui/chat/surface.css'")
    expect(surfaceCssSource).toContain('.chat-composer__input')
    expect(surfaceCssSource).toContain('font-size:16px')
  })
})
