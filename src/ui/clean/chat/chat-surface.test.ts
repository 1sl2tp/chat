import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const surfacePath = 'src/ui/clean/chat/chat-surface.ts'
const listPath = 'src/ui/clean/chat/message-list.ts'
const composerPath = 'src/ui/clean/chat/composer.ts'

describe('clean ChatSurface', () => {
  it('owns exactly one header, timeline and composer in that order', () => {
    expect(fs.existsSync(surfacePath)).toBe(true)
    if (!fs.existsSync(surfacePath)) return
    const source = fs.readFileSync(surfacePath, 'utf8')
    expect(source).toContain("shell.className = 'clean-chat'")
    expect(source).toContain("header.className = 'clean-chat__header'")
    expect(source).toContain("timeline.className = 'clean-chat__timeline clean-scrollbar'")
    expect(source).toContain("composerHost.className = 'clean-chat__composer'")
    expect(source).toContain('shell.append(header, timeline, composerHost)')
    expect(source).not.toContain('chatwoot-port/conversation-screen')
  })

  it('owns clean message and composer renderers without legacy visual imports', () => {
    expect(fs.existsSync(listPath)).toBe(true)
    expect(fs.existsSync(composerPath)).toBe(true)
    if (!fs.existsSync(listPath) || !fs.existsSync(composerPath)) return
    const source = `${fs.readFileSync(listPath, 'utf8')}\n${fs.readFileSync(composerPath, 'utf8')}`
    expect(source).toContain('clean-message')
    expect(source).toContain('clean-composer')
    expect(source).not.toContain('messages/message.css')
    expect(source).not.toContain('composer/composer.css')
  })

  it('mounts call action independently from initial availability so state updates can reveal it', () => {
    const source = fs.readFileSync(surfacePath, 'utf8')
    expect(source).toContain('if (options.onCall || options.actions)')
    expect(source).not.toContain('if (options.model.canCall && (options.onCall || options.actions))')
    expect(source).toContain('callButton.hidden = !model.canCall')
  })
})
