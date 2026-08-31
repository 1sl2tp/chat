import './style.css'
import { resolveStartupSurface } from './app/startup'
import { startAdminRuntime } from './admin/runtime'
import { startChatRuntime } from './chat/runtime'
import { setupPwa } from './pwa'
import { createSupabaseChatBackend } from './supabase/chat-backend'
import { createSupabaseIdentityBackend } from './supabase/identity-backend'
import { startSupabaseRuntime } from './supabase/runtime'
import { mountAdminScreen } from './ui/admin/screen'
import { mountCustomerChatScreen } from './ui/chat/customer-screen'
import { setupViewportController } from './viewport/controller'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) throw new Error('Missing #app root')

const redirectedPath = sessionStorage.getItem('chat.pages.redirect')
if (redirectedPath) {
  sessionStorage.removeItem('chat.pages.redirect')
  history.replaceState(null, '', redirectedPath)
}

setupViewportController()
startSupabaseRuntime()
setupPwa()

function mountStatus(message: string): void {
  const main = document.createElement('main')
  main.className = 'app-status'
  main.textContent = message
  root.replaceChildren(main)
}

async function startApplication(): Promise<void> {
  const chatBackend = createSupabaseChatBackend()
  const identityBackend = createSupabaseIdentityBackend()
  const surface = await resolveStartupSurface(window.location.pathname, {
    hasSession: () => chatBackend.hasSession(),
    signInAnonymously: () => chatBackend.signInAnonymously(),
    resolveIdentity: () => identityBackend.resolveCurrentIdentity(),
  })

  switch (surface.type) {
    case 'guest-chat':
    case 'customer-chat':
      await startChatRuntime()
      mountCustomerChatScreen(root)
      return
    case 'admin-workspace':
      mountAdminScreen(root)
      await startAdminRuntime()
      return
    case 'admin-login':
      mountStatus('Đăng nhập Admin')
      return
    case 'access-denied':
      mountStatus('Tài khoản này không có quyền Admin.')
      return
    case 'identity-error':
      mountStatus('Không thể xác định tài khoản hiện tại.')
      return
  }
}

void startApplication()
