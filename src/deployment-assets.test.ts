import { describe, expect, it } from 'vitest'
import rootHtml from '../index.html?raw'
import adminHtml from '../admin/index.html?raw'
import rootManifestRaw from '../public/manifest.webmanifest?raw'
import adminManifestRaw from '../public/admin/manifest.webmanifest?raw'
import notFoundHtml from '../public/404.html?raw'

describe('deployment assets stay relative', () => {
  it('keeps root and Admin HTML inside whichever base serves the artifact', () => {
    expect(rootHtml).toContain('rel="manifest" href="./manifest.webmanifest"')
    expect(rootHtml).toContain('href="./icons/apple-touch-icon.png"')
    expect(rootHtml).toContain('href="./icons/pwa-192.png"')

    expect(adminHtml).toContain('rel="manifest" href="./manifest.webmanifest"')
    expect(adminHtml).toContain('href="../icons/apple-touch-icon.png"')
    expect(adminHtml).toContain('href="../icons/pwa-192.png"')
  })

  it('uses relative manifest ids, start URLs, scopes and icons', () => {
    const rootManifest = JSON.parse(rootManifestRaw) as {
      id: string
      start_url: string
      scope: string
      icons: Array<{ src: string }>
    }
    const adminManifest = JSON.parse(adminManifestRaw) as {
      id: string
      start_url: string
      scope: string
      icons: Array<{ src: string }>
    }

    expect(rootManifest.id).toBe('./')
    expect(rootManifest.start_url).toBe('./')
    expect(rootManifest.scope).toBe('./')
    expect(rootManifest.icons.every((icon) => icon.src.startsWith('./icons/'))).toBe(true)

    expect(adminManifest.id).toBe('./')
    expect(adminManifest.start_url).toBe('./')
    expect(adminManifest.scope).toBe('./')
    expect(adminManifest.icons.every((icon) => icon.src.startsWith('../icons/'))).toBe(true)
  })

  it('keeps GitHub Pages 404 redirects inside the project base', () => {
    expect(notFoundHtml).toContain("window.location.hostname.endsWith('.github.io')")
    expect(notFoundHtml).toContain('window.location.replace(base)')
    expect(notFoundHtml).not.toContain("window.location.replace('/')")
  })
})
