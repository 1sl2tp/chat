import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('fixed test user call pairing wiring', () => {
  it('authenticates the fixed test user before chat bootstrap', async () => {
    const source = await readFile(new URL('../user-main.ts', import.meta.url), 'utf8')
    const fixedAuth = source.indexOf('await ensureFixedTestUser(')
    const chatBootstrap = source.indexOf('await startChatRuntime()')

    expect(fixedAuth).toBeGreaterThanOrEqual(0)
    expect(chatBootstrap).toBeGreaterThan(fixedAuth)
  })

  it('waits for microphone capture before starting call RPC work', async () => {
    const source = await readFile(new URL('../call/voice-session.ts', import.meta.url), 'utf8')
    const awaitedCapture = source.match(/await this\.media\.beginUserGesture\(\)/g) ?? []

    expect(awaitedCapture).toHaveLength(2)
  })
})
