import './style.css'
import { getAppLabel } from './app'
import { startChatRuntime } from './chat/runtime'
import { setupPwa } from './pwa'
import { startSupabaseRuntime } from './supabase/runtime'
import { formatVersionLabel } from './version'
import { setupViewportController } from './viewport/controller'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Missing #app root')
}

setupViewportController()
startSupabaseRuntime()
void startChatRuntime()

const screen = document.createElement('main')
screen.className = 'test-screen'
screen.setAttribute('aria-label', getAppLabel())

const heading = document.createElement('h1')
heading.textContent = getAppLabel()

const version = document.createElement('p')
version.className = 'app-version'
version.textContent = formatVersionLabel(import.meta.env.VITE_BUILD_ID ?? 'dev')

screen.append(heading, version)
root.append(screen)
setupPwa()
