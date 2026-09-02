import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const userCss = readFileSync(new URL('./user.css', import.meta.url), 'utf8')
const userMain = readFileSync(new URL('./user-main.ts', import.meta.url), 'utf8')

describe('User conversation layout', () => {
  it('keeps the composer mounted as the final shell row', () => {
    expect(userMain).toContain('<div id="composer" class="chat-composer"></div>')
    expect(userCss).toContain('grid-template-rows:auto auto minmax(0,1fr) auto')
    expect(userCss).toMatch(/#messages\{[^}]*min-height:0/)
    expect(userCss).toMatch(/#composer\{[^}]*align-self:end[^}]*min-height:/)
  })

  it('frames the User chat on fine-pointer desktop without hiding the composer', () => {
    expect(userCss).toContain('@media(hover:hover) and (pointer:fine)')
    expect(userCss).toContain('.user-app{border:1px solid')
  })
})
