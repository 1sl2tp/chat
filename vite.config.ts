import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/chat/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Chat',
        short_name: 'Chat',
        description: 'Chat PWA foundation',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#111111',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
      }
    })
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
