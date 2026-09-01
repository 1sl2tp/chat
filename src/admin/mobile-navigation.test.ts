import { describe, expect, it } from 'vitest'
import adminSource from '../admin-main.ts?raw'
import adminCss from '../admin.css?raw'

describe('Admin mobile conversation navigation', () => {
  it('drives the mobile chat overlay from selected conversation state', () => {
    expect(adminSource).toContain("dataset.selected = state.selectedConversationId ? 'true' : 'false'")
    expect(adminCss).toContain('.admin-app[data-selected="true"] .admin-chat')
  })

  it('does not infer selected conversation from whether any header button is enabled', () => {
    expect(adminCss).not.toContain(':has(.admin-chat header button:not(:disabled))')
  })
})
