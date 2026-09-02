/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import pwaSource from '../../pwa.ts?raw'
import adminPolishSource from '../../admin/zalo-polish.ts?raw'
import accountSource from '../../user/account-ui.ts?raw'
import callTimelineSource from './call-timeline.ts?raw'

const refinementCss = readFileSync(new URL('./conversation-refinement.css', import.meta.url), 'utf8')
const previewSource = readFileSync(new URL('../../../supabase/functions/taphoaxyz-link-preview/index.ts', import.meta.url), 'utf8')

describe('0.16.3 regression contracts', () => {
  it('uses call_id as the primary call timeline session key', () => {
    expect(callTimelineSource).toContain('call_id')
    expect(callTimelineSource).toContain('Cuộc gọi chưa kết nối')
  })

  it('keeps reaction away from the timestamp corner', () => {
    expect(refinementCss).toContain('.chat-message__reaction-summary')
    expect(refinementCss).toContain('left:8px')
    expect(refinementCss).toContain('right:auto')
  })

  it('decodes numeric HTML entities from social preview metadata', () => {
    expect(previewSource).toMatch(/fromCodePoint|parseInt/)
  })

  it('shows only User 2 and User 1 as the Admin inbox groups', () => {
    expect(adminPolishSource).toContain("label: 'USER 2' | 'USER 1'")
    expect(adminPolishSource).not.toContain('Chưa đọc')
    expect(adminPolishSource).not.toContain('Tất cả')
  })

  it('orders account identity as name then account then user type', () => {
    expect(accountSource).toContain('meta.append(account, modeElement)')
    expect(accountSource).toContain("typeLabel: 'User 1'")
  })

  it('forces service worker update checks to bypass browser script cache', () => {
    expect(pwaSource).toContain("updateViaCache: 'none'")
  })
})
