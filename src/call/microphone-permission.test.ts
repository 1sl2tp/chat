import { describe, expect, it } from 'vitest'
import {
  microphonePermissionNotice,
  readMicrophonePermission,
} from './microphone-permission'

describe('microphone permission state', () => {
  it('reads granted, prompt and denied without requesting media', async () => {
    for (const state of ['granted', 'prompt', 'denied'] as const) {
      const permissions = {
        query: async () => ({ state }),
      }
      await expect(readMicrophonePermission(permissions)).resolves.toBe(state)
    }
  })

  it('falls back to unknown when Permissions API cannot report microphone state', async () => {
    await expect(readMicrophonePermission(undefined)).resolves.toBe('unknown')
    await expect(readMicrophonePermission({ query: async () => { throw new Error('unsupported') } })).resolves.toBe('unknown')
  })

  it('only gives the Safari Ask guidance for iPhone prompt state', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1'
    expect(microphonePermissionNotice('prompt', iphone)).toContain('Microphone')
    expect(microphonePermissionNotice('granted', iphone)).toBeNull()
    expect(microphonePermissionNotice('prompt', 'Mozilla/5.0 (Windows NT 10.0) Chrome/140')).toBeNull()
  })
})
