import { describe, expect, it } from 'vitest'
import adminSource from '../admin-main.ts?raw'

describe('Admin mobile conversation navigation', () => {
  it('drives the mobile chat overlay from selected conversation state', () => {
    expect(adminSource).toContain("const adminApp = root.querySelector<HTMLElement>('.admin-app')!")
    expect(adminSource).toContain("adminApp.dataset.selected = state.selectedConversationId ? 'true' : 'false'")
  })

  it('Chatwoot back clears the selected conversation instead of keeping a legacy back control', () => {
    expect(adminSource).toContain('onBack: clearAdminSelection')
    expect(adminSource).not.toContain("back.addEventListener('click', clearAdminSelection)")
  })
})
