import './style.css'
import { getAppLabel } from './app'
import { setupPwa } from './pwa'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Missing #app root')
}

const screen = document.createElement('main')
screen.className = 'test-screen'
screen.setAttribute('aria-label', getAppLabel())

const heading = document.createElement('h1')
heading.textContent = getAppLabel()

screen.append(heading)
root.append(screen)
setupPwa()
