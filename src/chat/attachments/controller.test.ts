import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../messages'
import { sendAttachmentFile } from './controller'

const resultMessage: ChatMessage = {
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'p1',
  client_message_id: 'client-1',
  type: 'image',
  text: null,
  reply_to_id: null,
  created_at: '2026-09-02T00:00:00.000Z',
  edited_at: null,
  revoked_at: null,
  call_id: null,
  attachment: null,
}

describe('attachment upload controller', () => {
  it('uploads under conversation/profile ownership before sending the message', async () => {
    const calls: string[] = []
    const file = { name: 'ảnh test.png', type: 'image/png', size: 123 } as File

    const message = await sendAttachmentFile({
      async upload(path) {
        calls.push(`upload:${path}`)
      },
      async remove(path) {
        calls.push(`remove:${path}`)
      },
      async send(input) {
        calls.push(`send:${input.attachment.path}:${input.type}`)
        expect(input.attachment).toMatchObject({ kind: 'image', name: 'ảnh test.png', mime: 'image/png', size: 123 })
        return { ...resultMessage, attachment: input.attachment }
      },
    }, {
      conversationId: 'c1',
      profileId: 'p1',
    }, file, () => 'client-1')

    expect(message.attachment?.kind).toBe('image')
    expect(calls).toEqual([
      'upload:c1/p1/client-1-ảnh test.png',
      'send:c1/p1/client-1-ảnh test.png:image',
    ])
  })

  it('removes the uploaded object when sending the message fails', async () => {
    const removed: string[] = []
    const file = { name: 'note.txt', type: 'text/plain', size: 7 } as File

    await expect(sendAttachmentFile({
      async upload() {},
      async remove(path) {
        removed.push(path)
      },
      async send() {
        throw new Error('send_failed')
      },
    }, {
      conversationId: 'c1',
      profileId: 'p1',
    }, file, () => 'client-2')).rejects.toThrow('send_failed')

    expect(removed).toEqual(['c1/p1/client-2-note.txt'])
  })
})
