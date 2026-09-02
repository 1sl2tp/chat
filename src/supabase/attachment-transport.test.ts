import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseAttachmentTransport, createSignedAttachmentUrl } from './attachment-transport'

function fakeClient() {
  const calls: Array<{ op: string; value: unknown }> = []
  const bucket = {
    async upload(path: string, _file: File, options: unknown) {
      calls.push({ op: 'upload', value: { path, options } })
      return { data: { path }, error: null }
    },
    async remove(paths: string[]) {
      calls.push({ op: 'remove', value: paths })
      return { data: paths, error: null }
    },
    async createSignedUrl(path: string, seconds: number) {
      calls.push({ op: 'signed', value: { path, seconds } })
      return { data: { signedUrl: `https://signed.test/${path}` }, error: null }
    },
  }

  const client = {
    storage: {
      from(name: string) {
        calls.push({ op: 'bucket', value: name })
        return bucket
      },
    },
    async rpc(name: string, params: unknown) {
      calls.push({ op: 'rpc', value: { name, params } })
      return {
        data: {
          id: 'm1', conversation_id: 'c1', sender_id: 'p1', client_message_id: 'cm1', type: 'file', text: null,
          reply_to_id: null, created_at: '2026-09-02T00:00:00.000Z', edited_at: null, revoked_at: null, call_id: null,
          attachment: { kind: 'file', path: 'c1/p1/cm1-a.txt', name: 'a.txt', mime: 'text/plain', size: 1 },
        },
        error: null,
      }
    },
  } as unknown as SupabaseClient

  return { client, calls }
}

describe('Supabase attachment transport', () => {
  it('uploads to the private attachment bucket and sends the attachment RPC', async () => {
    const { client, calls } = fakeClient()
    const transport = createSupabaseAttachmentTransport(client)
    const file = { name: 'a.txt', type: 'text/plain', size: 1 } as File

    await transport.upload('c1/p1/cm1-a.txt', file)
    await transport.send({
      conversationId: 'c1',
      clientMessageId: 'cm1',
      type: 'file',
      attachment: { kind: 'file', path: 'c1/p1/cm1-a.txt', name: 'a.txt', mime: 'text/plain', size: 1 },
    })

    expect(calls).toContainEqual({ op: 'bucket', value: 'chat-attachments' })
    expect(calls).toContainEqual({
      op: 'rpc',
      value: {
        name: 'chat_send_attachment_message',
        params: {
          p_conversation_id: 'c1', p_client_message_id: 'cm1', p_type: 'file',
          p_attachment: { kind: 'file', path: 'c1/p1/cm1-a.txt', name: 'a.txt', mime: 'text/plain', size: 1 },
          p_text: null,
        },
      },
    })
  })

  it('creates a one-hour signed URL for a private attachment', async () => {
    const { client } = fakeClient()
    await expect(createSignedAttachmentUrl(client, 'c1/p1/cm1-a.txt')).resolves.toBe('https://signed.test/c1/p1/cm1-a.txt')
  })
})
