import { describe, expect, it } from 'vitest'
import userHtml from '../../index.html?raw'
import adminHtml from '../../admin/index.html?raw'
import userManifestSource from '../../public/manifest.webmanifest?raw'
import adminManifestSource from '../../public/admin/manifest.webmanifest?raw'
import viteConfigSource from '../../vite.config.ts?raw'

describe('PWA install identity', () => {
  it('keeps User and Admin as separate installable apps', () => {
    const userManifest = JSON.parse(userManifestSource) as Record<string, unknown>
    const adminManifest = JSON.parse(adminManifestSource) as Record<string, unknown>

    expect(userManifest.id).toBe('./')
    expect(userManifest.start_url).toBe('./')
    expect(userManifest.scope).toBe('./')

    expect(adminManifest.id).toBe('./')
    expect(adminManifest.start_url).toBe('./')
    expect(adminManifest.scope).toBe('./')
    expect(adminManifest.name).not.toBe(userManifest.name)
  })

  it('links each HTML entry to the manifest beside that app entry', () => {
    expect(userHtml).toContain('rel="manifest" href="./manifest.webmanifest"')
    expect(adminHtml).toContain('rel="manifest" href="./manifest.webmanifest"')
    expect(userHtml).toContain('apple-mobile-web-app-title" content="Chat"')
    expect(adminHtml).toContain('apple-mobile-web-app-title" content="Hỗ trợ"')
  })

  it('disables the single generated manifest from vite-plugin-pwa', () => {
    expect(viteConfigSource).toContain('manifest: false')
  })
})
