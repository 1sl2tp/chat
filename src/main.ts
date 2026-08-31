import './style.css'
import { bootstrapAdminIdentity, startAdminWorkspace } from './admin/bootstrap'
import { startAdminRuntime } from './admin/runtime'
import { setAdminState } from './admin/store'
import { startChatRuntime } from './chat/runtime'
import { getDeviceLabel, getDevicePlatform, getOrCreateDeviceKey } from './device/identity'
import { setupPwa } from './pwa'
import { getAppMode } from './routing/mode'
import { createSupabaseChatBackend } from './supabase/chat-backend'
import { adminSupabase } from './supabase/client'
import { startSupabaseRuntime } from './supabase/runtime'
import { mountAdminLogin } from './ui/admin/login'
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
const appMode = getAppMode(window.location.pathname)

async function bootAdminWorkspace(): Promise<void> {
  mountAdminScreen(root)
  const chatBackend = createSupabaseChatBackend(adminSupabase)

  await startAdminWorkspace({
    bootstrap: () => bootstrapAdminIdentity(chatBackend, {
      deviceKey: getOrCreateDeviceKey(),
      label: getDeviceLabel(),
      platform: getDevicePlatform(),
    }),
    startAdmin: startAdminRuntime,
    onError(error) {
      if (error.message.includes('admin_required') || error.message.includes('admin_session_required')) {
        void adminSupabase.auth.signOut().finally(() => {
          mountAdminLogin(root, bootAdminWorkspace, 'Tài khoản này không có quyền Admin.')
        })
        return
      }

      setAdminState({
        phase: 'error',
        inbox: [],
        selectedConversationId: null,
        detail: null,
        error: error.message,
      })
    },
  })
}

async function startAdminApp(): Promise<void> {
  const { data, error } = await adminSupabase.auth.getSession()
  if (error) {
    mountAdminLogin(root, bootAdminWorkspace, 'Không đọc được phiên Admin.')
    return
  }

  if (!data.session) {
    mountAdminLogin(root, bootAdminWorkspace)
    return
  }

  await bootAdminWorkspace()
}

if (appMode === 'admin') {
  void startAdminApp()
} else {
  startSupabaseRuntime()
  void startChatRuntime()
  mountCustomerChatScreen(root)
}

setupPwa()
