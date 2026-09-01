import { describe, expect, it } from 'vitest'
import { APP_BASE_PATH, serviceWorkerAssetBase } from './deployment'
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

  it('precache assets from the service worker script directory', () => {
    expect(serviceWorkerAssetBase('https://chat.taphoa.xyz/sw.js')).toBe('https://chat.taphoa.xyz/')
    expect(serviceWorkerAssetBase('https://1sl2tp.github.io/chat/sw.js')).toBe('https://1sl2tp.github.io/chat/')
  })
})
