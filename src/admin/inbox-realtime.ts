import { adminSupabase } from '../supabase/client'

export interface AdminInboxWatcher {
  start(onChange: () => void): void
  stop(): void
}

const REFRESH_DEBOUNCE_MS = 80
const RECOVERY_HEARTBEAT_MS = 3000

export function createAdminInboxWatcher(): AdminInboxWatcher {
  let channel: ReturnType<typeof adminSupabase.channel> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let visibilityHandler: (() => void) | null = null
  let pageShowHandler: (() => void) | null = null

  const clearScheduledRefresh = (): void => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  const stop = (): void => {
    clearScheduledRefresh()
    if (heartbeat !== null) {
      clearInterval(heartbeat)
      heartbeat = null
    }
    if (typeof document !== 'undefined' && visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
    if (typeof window !== 'undefined' && pageShowHandler) {
      window.removeEventListener('pageshow', pageShowHandler)
      pageShowHandler = null
    }
    if (channel) {
      void adminSupabase.removeChannel(channel)
      channel = null
    }
  }

  return {
    start(onChange) {
      stop()

      const scheduleRefresh = (): void => {
        clearScheduledRefresh()
        timer = setTimeout(() => {
          timer = null
          onChange()
        }, REFRESH_DEBOUNCE_MS)
      }

      channel = adminSupabase
        .channel('admin-inbox')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_messages' },
          scheduleRefresh,
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') scheduleRefresh()
        })

      if (typeof document !== 'undefined') {
        visibilityHandler = () => {
          if (document.visibilityState === 'visible') scheduleRefresh()
        }
        document.addEventListener('visibilitychange', visibilityHandler)
      }

      if (typeof window !== 'undefined') {
        pageShowHandler = scheduleRefresh
        window.addEventListener('pageshow', pageShowHandler)
      }

      heartbeat = setInterval(() => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          scheduleRefresh()
        }
      }, RECOVERY_HEARTBEAT_MS)
    },
    stop,
  }
}
