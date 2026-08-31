import './style.css'
import { resolveStartupSurface } from './app/startup'
import { clearAdminSelection, startAdminRuntime } from './admin/runtime'
import { startChatRuntime } from './chat/runtime'
import { resetIdentity, resolveIdentity } from './identity/runtime'
import { setupPwa } from './pwa'
import { createSupabaseAuthActions } from './supabase/auth-actions'
import { createSupabaseChatBackend } from './supabase/chat-backend'
import { createSupabaseIdentityBackend } from './supabase/identity-backend'
import { startSupabaseRuntime } from './supabase/runtime'
import { mountAdminAccessDenied, mountAdminLogin } from './ui/admin/login'
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

let unmountSurface: (() => void) | null = null

function replaceSurface(mount: () => void | (() => void)): void {
  unmountSurface?.()
  unmountSurface = mount() || null
}

function mountStatus(message: string): void {
  replaceSurface(() => {
    const main = document.createElement('main')
    main.className = 'app-status'
    main.textContent = message
    root.replaceChildren(main)
  })
}

async function startApplication(): Promise<void> {
  const chatBackend = createSupabaseChatBackend()
  const identityBackend = createSupabaseIdentityBackend()
  const authActions = createSupabaseAuthActions()

  const surface = await resolveStartupSurface(window.location.pathname, {
    hasSession: () => chatBackend.hasSession(),
    signInAnonymously: () => chatBackend.signInAnonymously(),
    resolveIdentity: () => resolveIdentity(identityBackend),
  })

  switch (surface.type) {
    case 'guest-chat':
    case 'customer-chat':
      await startChatRuntime()
      replaceSurface(() => mountCustomerChatScreen(root))
      return

    case 'admin-workspace':
      replaceSurface(() => mountAdminScreen(root, {
        onLogout: async () => {
          clearAdminSelection()
          await authActions.signOut()
          resetIdentity()
          await startApplication()
        },
      }))
      await startAdminRuntime()
      return

    case 'admin-login':
      replaceSurface(() => mountAdminLogin(root, {
        onSubmit: async (credentials) => {
          await authActions.signInWithPassword(credentials)
          resetIdentity()
          await startApplication()
          const resolved = await identityBackend.resolveCurrentIdentity()
          if (resolved.kind !== 'admin') throw new Error('admin_required')
        },
      }))
      return

    case 'access-denied':
      if (window.location.pathname.startsWith('/admin')) {
        replaceSurface(() => mountAdminAccessDenied(root, async () => {
          await authActions.signOut()
          resetIdentity()
          await startApplication()
        }))
      } else {
        mountStatus('Đây là tài khoản Admin. Hãy mở khu vực /admin.')
      }
      return

    case 'identity-error':
      mountStatus('Không thể xác định tài khoản hiện tại.')
      return
  }
}

void startApplication()
