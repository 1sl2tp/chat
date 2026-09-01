import { describe, expect, it } from 'vitest'
import packageSource from '../../package.json?raw'
import userHtml from '../../index.html?raw'
import adminHtml from '../../admin/index.html?raw'

describe('LiveKit production bundling', () => {
  it('pins LiveKit in package dependencies and removes CDN ownership', () => {
    const pkg = JSON.parse(packageSource) as { dependencies?: Record<string, string> }
    expect(pkg.dependencies?.['livekit-client']).toBe('2.22.1')
    expect(userHtml).not.toContain('cdn.jsdelivr.net/npm/livekit-client')
    expect(adminHtml).not.toContain('cdn.jsdelivr.net/npm/livekit-client')
  })
})
