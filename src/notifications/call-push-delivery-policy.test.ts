import { describe, expect, it } from 'vitest'
import {
  classifyPushSendError,
  shouldFailPushDelivery,
} from '../../supabase/functions/taphoaxyz-call-push/delivery-policy'

describe('call push delivery policy', () => {
  it('expires only subscriptions rejected as gone by the push gateway', () => {
    expect(classifyPushSendError({ statusCode: 404, message: 'not found' })).toMatchObject({ expired: true, statusCode: 404 })
    expect(classifyPushSendError({ statusCode: 410, message: 'gone' })).toMatchObject({ expired: true, statusCode: 410 })
    expect(classifyPushSendError({ statusCode: 503, message: 'unavailable' })).toMatchObject({ expired: false, statusCode: 503 })
  })

  it('preserves a short diagnostic reason without exposing subscription data', () => {
    expect(classifyPushSendError({ statusCode: 503, message: 'gateway unavailable' }).reason)
      .toBe('503:gateway unavailable')
    expect(classifyPushSendError(new Error('network failed')).reason)
      .toBe('0:network failed')
  })

  it('fails the dispatch only when every attempted live delivery failed', () => {
    expect(shouldFailPushDelivery(0, 1)).toBe(true)
    expect(shouldFailPushDelivery(1, 1)).toBe(false)
    expect(shouldFailPushDelivery(0, 0)).toBe(false)
  })
})
