/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const adminCss = readFileSync(new URL('./admin.css', import.meta.url), 'utf8')
const userCss = readFileSync(new URL('./user.css', import.meta.url), 'utf8')

describe('compact chat/admin UI density', () => {
  it('keeps the admin shell compact without breaking the 280px floor', () => {
    expect(adminCss).toContain('min-width:280px')
    expect(adminCss).toContain('.admin-inbox>header{min-height:48px')
    expect(adminCss).toContain('.inbox-item{width:100%;display:block;padding:9px 10px')
    expect(adminCss).toContain('white-space:normal')
    expect(adminCss).not.toContain('.admin-app header{')
  })

  it('keeps the User header compact without breaking the 280px floor', () => {
    expect(userCss).toContain('min-width:280px')
    expect(userCss).toContain('.user-header{display:grid;grid-template-columns:44px minmax(0,1fr) 44px')
    expect(userCss).toContain('.user-header-icon{display:grid;place-items:center;width:42px;height:42px')
    expect(userCss).toContain('@media(max-width:320px)')
  })
})
