import './style.css'
import { startAdminRuntime } from './admin/runtime'
import { startChatRuntime } from './chat/runtime'
import { setupPwa } from './pwa'
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
  void startAdminRuntime()
} else {
  void startChatRuntime()
  mountCustomerChatScreen(root)
}

setupPwa()
