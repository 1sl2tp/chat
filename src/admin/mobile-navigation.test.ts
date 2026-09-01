import { describe, expect, it } from 'vitest'
import adminSource from '../admin-main.ts?raw'

describe('Admin mobile conversation navigation', () => {
  it('drives the mobile chat overlay from selected conversation state', () => {
    expect(adminSource).toContain("const adminApp = root.querySelector<HTMLElement>('.admin-app')!")
    expect(adminSource).toContain("adminApp.dataset.selected = state.selectedConversationId ? 'true' : 'false'")
  })

  it('back clears the selected conversation instead of changing unrelated controls', () => {
    expect(adminSource).toContain("back.addEventListener('click', clearAdminSelection)")
  })
})
