import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import callFacadeSource from '../../../call/ui.ts?raw'

const sourcePath = new URL('./call-widget.ts', import.meta.url)
const cssPath = new URL('./call-widget.css', import.meta.url)

describe('Chatwoot CallWidget production contract', () => {
  it('ports the approved CallCard hierarchy and real controls', () => {
    const source = readFileSync(sourcePath, 'utf8')
    const css = readFileSync(cssPath, 'utf8')
    expect(source).toContain('mountChatwootCallUi')
    expect(source).toContain('cw-call-card__status')
    expect(source).toContain('cw-call-card__identity')
    expect(source).toContain('cw-call-card__controls')
    expect(source).toContain('cw-call-card__primary-actions')
    expect(source).toContain('cw-call-compact')
    expect(source).toContain('cw-call-hidden')
    expect(css).toContain('border-radius: 16px')
    expect(css).toContain('backdrop-filter: blur')
  })

  it('owns all visible Call DOM behind the existing runtime facade', () => {
    expect(callFacadeSource).toContain("from '../ui/chatwoot-port/call/call-widget'")
    expect(callFacadeSource).toContain('export const mountVoiceCallUi = mountChatwootCallUi')
    expect(callFacadeSource).not.toContain('voice-call-full')
    expect(callFacadeSource).not.toContain('voice-call-pill')
  })
})
