import './style.css'
import { bootstrapAdminIdentity, startAdminWorkspace } from './admin/bootstrap'
import { startAdminRuntime } from './admin/runtime'
import { setAdminState } from './admin/store'
import { startChatRuntime } from './chat/runtime'
import { getDeviceLabel, getDevicePlatform, getOrCreateDeviceKey } from './device/identity'
import { setupPwa } from './pwa'
import { createSupabaseChatBackend } from './supabase/chat-backend'
import { startSupabaseRuntime } from './supabase/runtime'
import { mountAdminScreen } from './ui/admin/screen'
import { mountCustomerChatScreen } from './ui/chat/customer-screen'
import { setupViewportController } from './viewport/controller'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Missing #app root')
}

const redirectedPath = sessionStorage.getItem('chat.pages.redirect')
if (redirectedPath) {
  sessionStorage.removeItem('chat.pages.redirect')
  history.replaceState(null, '', redirectedPath)
}

setupViewportController()
startSupabaseRuntime()

const adminMode = window.location.pathname === '/admin' || window.location.pathname === '/admin/'

if (adminMode) {
  mountAdminScreen(root)
  const chatBackend = createSupabaseChatBackend()
  void startAdminWorkspace({
    bootstrap: () => bootstrapAdminIdentity(chatBackend, {
      deviceKey: getOrCreateDeviceKey(),
      label: getDeviceLabel(),
      platform: getDevicePlatform(),
    }),
    startAdmin: startAdminRuntime,
    onError(error) {
      setAdminState({
        phase: 'error',
        inbox: [],
        selectedConversationId: null,
        detail: null,
        error: error.message,
      })
    },
  })
} else {
  void startChatRuntime()
  mountCustomerChatScreen(root)
}

setupPwa()
