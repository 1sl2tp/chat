import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_BASE_PATH, PWA_APP_ID } from './src/deployment.js'

const buildId = process.env.VITE_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'local'

export default defineConfig({
  base: APP_BASE_PATH,
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
  },
  build: {
    rollupOptions: {
      input: {
        user: 'index.html',
        admin: 'admin/index.html',
        audioLab: 'audio-lab/index.html',
        minimalCall: 'call-minimal/index.html',
        micTest: 'mic-test/index.html',
      },
    },
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        id: PWA_APP_ID,
        name: 'Chat',
        short_name: 'Chat',
        description: 'Chat Web App',
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
      }
    })
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
