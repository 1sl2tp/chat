import { describe, expect, it } from 'vitest'
import adminCss from './admin.css?raw'
import userCss from './user.css?raw'

describe('compact chat/admin UI density', () => {
  it('keeps the admin shell compact without breaking the 280px floor', () => {
    expect(adminCss).toContain('min-width:280px')
    expect(adminCss).toContain('.admin-app header{min-height:52px')
    expect(adminCss).toContain('.inbox-item{width:100%;display:block;padding:9px 10px')
    expect(adminCss).toContain('white-space:normal')
  })

  it('keeps the user header compact without breaking the 280px floor', () => {
    expect(userCss).toContain('min-width:280px')
    expect(userCss).toContain('.user-app>header{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 12px')
    expect(userCss).toContain('.call-notification-button,.user-auth-action{height:30px')
  })
})
