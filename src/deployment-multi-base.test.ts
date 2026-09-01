import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APP_BASE_PATH } from './deployment'
import { pwaOwnerForPath, pwaRegistrationDescriptor } from './pwa/registration'

describe('multi-base deployment', () => {
  it('builds assets relative so one artifact can serve root or /chat/', () => {
    expect(APP_BASE_PATH).toBe('./')
  })

  it('keeps User and Admin service workers inside the runtime app base', () => {
    expect(pwaRegistrationDescriptor('user', '/')).toEqual({ scriptUrl: '/sw.js', scope: '/' })
    expect(pwaRegistrationDescriptor('admin', '/admin/')).toEqual({ scriptUrl: '/sw.js', scope: '/admin/' })
    expect(pwaRegistrationDescriptor('user', '/chat/')).toEqual({ scriptUrl: '/chat/sw.js', scope: '/chat/' })
    expect(pwaRegistrationDescriptor('admin', '/chat/admin/')).toEqual({ scriptUrl: '/chat/sw.js', scope: '/chat/admin/' })
    expect(pwaOwnerForPath('/chat/admin/')).toBe('admin')
  })

  it('uses relative manifest URLs and scopes', () => {
    const userHtml = readFileSync('index.html', 'utf8')
    const adminHtml = readFileSync('admin/index.html', 'utf8')
    const userManifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as Record<string, unknown>
    const adminManifest = JSON.parse(readFileSync('public/admin/manifest.webmanifest', 'utf8')) as Record<string, unknown>

    expect(userHtml).toContain('href="./manifest.webmanifest"')
    expect(adminHtml).toContain('href="./manifest.webmanifest"')
    expect(userManifest.id).toBe('./')
    expect(userManifest.start_url).toBe('./')
    expect(userManifest.scope).toBe('./')
    expect(adminManifest.id).toBe('./')
    expect(adminManifest.start_url).toBe('./')
    expect(adminManifest.scope).toBe('./')
  })
})
