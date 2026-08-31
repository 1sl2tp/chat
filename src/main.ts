import './style.css'
import { startChatRuntime } from './chat/runtime'
import { setupPwa } from './pwa'
import { startSupabaseRuntime } from './supabase/runtime'
import { mountCustomerChatScreen } from './ui/chat/customer-screen'
import { setupViewportController } from './viewport/controller'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Missing #app root')
}

setupViewportController()
startSupabaseRuntime()
void startChatRuntime()
mountCustomerChatScreen(root)
setupPwa()
