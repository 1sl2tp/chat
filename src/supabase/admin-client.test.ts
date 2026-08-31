import { describe, expect, it } from 'vitest'
import { ADMIN_AUTH_STORAGE_KEY } from './client'

describe('Admin Supabase client', () => {
  it('uses a dedicated auth storage key', () => {
    expect(ADMIN_AUTH_STORAGE_KEY).toBe('taphoa-chat-admin-auth')
  })
})
