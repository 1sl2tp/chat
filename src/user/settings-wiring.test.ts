import { describe, expect, it } from 'vitest'
import source from '../user-main.ts?raw'

describe('User2 account and notification settings wiring', () => {
  it('keeps notification preferences inside the User2 drawer', () => {
    expect(source).toContain('id="user2-settings"')
    expect(source).toContain('id="notification-chat"')
    expect(source).toContain('id="notification-call"')
    expect(source).toContain('id="notification-sound"')
    expect(source).toContain('id="notification-vibrate"')
    expect(source).toContain("settingsPanel.hidden = rootMode !== 'user2'")
  })

  it('loads and persists preferences through the shared Cache Storage owner', () => {
    expect(source).toContain('createCacheNotificationPreferencesStorage')
    expect(source).toContain('loadNotificationPreferences')
    expect(source).toContain('saveNotificationPreferences')
  })

  it('uses current sound/vibration choices for test notifications', () => {
    expect(source).toContain("testFromUserGesture(notificationDeliveryOptions('incoming_call', notificationPreferences))")
  })

  it('changes User2 password through Auth without ending the chat session', () => {
    expect(source).toContain('changeUser2Password')
    expect(source).toContain('userSupabase.auth.updateUser({ password })')
    expect(source).toContain('id="password-change-form"')
  })
})
