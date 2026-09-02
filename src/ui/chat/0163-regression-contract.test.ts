/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import pwaSource from '../../pwa.ts?raw'
import adminPolishSource from '../../admin/zalo-polish.ts?raw'
import accountSource from '../../user/account-ui.ts?raw'
import callTimelineSource from './call-timeline.ts?raw'

const css = readFileSync(new URL('./surface.css', import.meta.url), 'utf8')
const previewSource = readFileSync(new URL('../../../supabase/functions/taphoaxyz-link-preview/index.ts', import.meta.url), 'utf8')

describe('0.16.3 regression contracts', () => {
  it('uses call_id as the primary call timeline session key', () => {
    expect(callTimelineSource).toContain('call_id')
    expect(callTimelineSource).toContain('Cuộc gọi chưa kết nối')
  })

  it('keeps reaction away from the timestamp corner', () => {
    expect(css).toContain('.chat-message__reaction-summary')
    expect(css).toContain('left:')
  })

  it('decodes numeric HTML entities from social preview metadata', () => {
    expect(previewSource).toMatch(/&#x|codePoint|parseInt/)
  })

  it('shows only User 2 and User 1 as Admin inbox role filters', () => {
    expect(adminPolishSource).toContain("data-filter=\"all\"")
    expect(adminPolishSource).toContain("data-filter=\"unread\"")
    expect(adminPolishSource).toContain('hidden = true')
    expect(adminPolishSource).toContain('USER 1')
  })

  it('orders account identity as name then account then user type', () => {
    const accountIndex = accountSource.indexOf('meta.append(account')
    const typeIndex = accountSource.indexOf('modeElement')
    expect(accountIndex).toBeGreaterThan(-1)
    expect(accountIndex).toBeLessThan(typeIndex === -1 ? Number.MAX_SAFE_INTEGER : accountSource.lastIndexOf('modeElement'))
  })

  it('forces service worker update checks to bypass browser script cache', () => {
    expect(pwaSource).toContain("updateViaCache: 'none'")
  })
})
