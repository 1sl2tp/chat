import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_BASE_PATH } from './src/deployment.js'

const buildId = process.env.VITE_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'local'
const includeDiagnostics = process.env.VITE_INCLUDE_DIAGNOSTICS === 'true'

const productInputs = {
  user: 'index.html',
  admin: 'admin/index.html',
}

const diagnosticInputs = {
  audioLab: 'audio-lab/index.html',
  minimalCall: 'call-minimal/index.html',
  micTest: 'mic-test/index.html',
}

export default defineConfig({
  base: APP_BASE_PATH,
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
  },
  build: {
    rollupOptions: {
      input: includeDiagnostics ? { ...productInputs, ...diagnosticInputs } : productInputs,
    },
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'icons/apple-touch-icon.png',
        'manifest.webmanifest',
        'admin/manifest.webmanifest',
      ],
      manifest: false,
    })
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
