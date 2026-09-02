import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import userMainSource from '../../../user-main.ts?raw'
import adminMainSource from '../../../admin-main.ts?raw'

const sourcePath = new URL('./call-widget.ts', import.meta.url)
const cssPath = new URL('./call-widget.css', import.meta.url)

describe('Chatwoot CallWidget production contract', () => {
  it('ports Chatwoot CallCard hierarchy and controls', () => {
    const source = readFileSync(sourcePath, 'utf8')
    const css = readFileSync(cssPath, 'utf8')
    expect(source).toContain('mountChatwootCallUi')
    expect(source).toContain('cw-call-card__status')
    expect(source).toContain('cw-call-card__identity')
    expect(source).toContain('cw-call-card__actions')
    expect(css).toContain('border-radius: 16px')
    expect(css).toContain('backdrop-filter: blur')
  })

  it('replaces the legacy call presentation in User and Hỗ trợ entries', () => {
    for (const source of [userMainSource, adminMainSource]) {
      expect(source).toContain("from './ui/chatwoot-port/call/call-widget'")
      expect(source).toContain('mountChatwootCallUi')
      expect(source).not.toContain('mountVoiceCallUi')
      expect(source).not.toContain("from './call/ui'")
    }
  })
})
