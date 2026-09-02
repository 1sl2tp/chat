import { describe, expect, it } from 'vitest'
import source from './composer.ts?raw'
import { normalizeDraft } from './composer'

describe('composer draft', () => {
  it('trims outer whitespace before send', () => {
    expect(normalizeDraft('  xin chào  ')).toBe('xin chào')
  })

  it('treats whitespace-only input as empty', () => {
    expect(normalizeDraft('   \n ')).toBe('')
  })

  it('shows the named app version and build id in the shared User/Admin composer', () => {
    expect(source).toContain('formatVersionLabel')
    expect(source).toContain("import.meta.env.VITE_BUILD_ID ?? 'dev'")
    expect(source).toContain("version.className = 'chat-composer__version'")
    expect(source).toContain('container.replaceChildren(plus, input, recordingStatus, mic, send, version)')
  })
})
