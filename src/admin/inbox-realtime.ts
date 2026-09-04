import { adminSupabase } from '../supabase/client'

export interface AdminInboxEvent {
  conversationId: string
  text: string | null
  type: string | null
  createdAt: string | null
}

export interface AdminInboxWatcher {
  start(onChange: (event: AdminInboxEvent) => void): void
  stop(): void
}

function readEvent(value: unknown): AdminInboxEvent | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const conversationId = row.conversation_id
  if (typeof conversationId !== 'string' || conversationId.length === 0) return null
  return {
    conversationId,
    text: typeof row.text === 'string' ? row.text : null,
    type: typeof row.type === 'string' ? row.type : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : null,
  }
}

export function createAdminInboxWatcher(): AdminInboxWatcher {
  let channel: ReturnType<typeof adminSupabase.channel> | null = null

  const stop = (): void => {
    if (channel) {
      void adminSupabase.removeChannel(channel)
      channel = null
    }
  }

  return {
    start(onChange) {
      stop()
      channel = adminSupabase
        .channel('admin-inbox')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages' },
          (payload) => {
            const event = readEvent(payload.new)
            if (event) onChange(event)
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
          (payload) => {
            const event = readEvent(payload.new)
            if (event) onChange(event)
          },
        )
        .subscribe()
    },
    stop,
  }
}
