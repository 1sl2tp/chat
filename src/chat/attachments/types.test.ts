import { describe, expect, it } from 'vitest'
import { MAX_ATTACHMENT_BYTES, attachmentKindForMime, sanitizeAttachmentName } from './types'

describe('chat attachment contract', () => {
  it('keeps image/audio/file inside one message attachment model', () => {
    expect(attachmentKindForMime('image/jpeg')).toBe('image')
    expect(attachmentKindForMime('audio/mp4')).toBe('audio')
    expect(attachmentKindForMime('application/pdf')).toBe('file')
  })

  it('uses a small-system 20 MB upload ceiling', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(20 * 1024 * 1024)
  })

  it('removes path separators from display/storage names', () => {
    expect(sanitizeAttachmentName('../bao/gia.pdf')).toBe('bao_gia.pdf')
  })
})
