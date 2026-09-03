import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const callSource = fs.readFileSync('src/ui/clean/call/call-ui.ts', 'utf8')
const userSource = fs.readFileSync('src/user-clean-main.ts', 'utf8')
const adminSource = fs.readFileSync('src/admin-clean-main.ts', 'utf8')

describe('clean call presentation', () => {
  it('owns full and compact call states with only supported controls', () => {
    expect(callSource).toContain('clean-call')
    expect(callSource).toContain('clean-call-compact')
    expect(callSource).toContain('session.accept()')
    expect(callSource).toContain('session.hangup()')
    expect(callSource).toContain('session.toggleMute()')
    expect(callSource).toContain('session.chooseSpeaker()')
    expect(callSource).toContain("session.setDisplay('compact')")
    expect(callSource).toContain("session.setDisplay('full')")
    expect(callSource).not.toContain('hold')
    expect(callSource).not.toContain('transfer')
  })

  it('is the only call UI imported by clean User and Admin entries', () => {
    for (const source of [userSource, adminSource]) {
      expect(source).toContain("from './ui/clean/call/call-ui'")
      expect(source).not.toContain("from './call/ui'")
      expect(source).not.toContain("import './call/call.css'")
      expect(source).not.toContain('chatwoot-port/call/call-widget')
    }
  })
})
