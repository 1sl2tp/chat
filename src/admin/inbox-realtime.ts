import { adminSupabase } from '../supabase/client'

export interface AdminInboxWatcher {
  start(onChange: () => void): void
  stop(): void
}

export function createAdminInboxWatcher(): AdminInboxWatcher {
  let channel: ReturnType<typeof adminSupabase.channel> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const stop = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
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
          { event: '*', schema: 'public', table: 'chat_messages' },
          () => {
            if (timer !== null) clearTimeout(timer)
            timer = setTimeout(() => {
              timer = null
              onChange()
            }, 100)
          },
        )
        .subscribe()
    },
    stop,
  }
}
