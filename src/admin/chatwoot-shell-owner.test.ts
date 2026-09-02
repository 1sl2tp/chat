/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import adminMainSource from '../admin-main.ts?raw'
import managementSource from './chatwoot-management-ui.ts?raw'

const adminCssSource = readFileSync(new URL('../admin.css', import.meta.url), 'utf8')

describe('Admin Chatwoot shell owner', () => {
  it('mounts ConversationScreen directly into the admin chat pane instead of a legacy messages child', () => {
    expect(adminMainSource).toContain('id="admin-conversation-host"')
    expect(adminMainSource).toContain('root: conversationHost')
    expect(adminMainSource).not.toContain('id="admin-messages"')
    expect(adminMainSource).not.toContain('id="admin-composer"')
    expect(adminMainSource).not.toContain("const legacyChatHeader")
  })

  it('keeps management UI independent from the removed legacy chat header', () => {
    expect(managementSource).not.toContain("app.querySelector<HTMLElement>('.admin-chat > header')")
    expect(managementSource).toContain("app.querySelector<HTMLElement>('#admin-conversation-host')")
  })

  it('scopes legacy admin header CSS to Inbox so it cannot override Chatwoot Conversation header', () => {
    expect(adminCssSource).not.toContain('.admin-app header{')
    expect(adminCssSource).not.toContain('.admin-app header button')
    expect(adminCssSource).toContain('.admin-inbox>header{')
  })
})
