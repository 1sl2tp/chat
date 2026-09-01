import { describe, expect, it } from 'vitest'
import {
  clearNativeAndroidAudioRoute,
  hasNativeAndroidAudioRoute,
  setNativeAndroidAudioRoute,
} from './native-android-audio-route'

describe('native Android audio route bridge', () => {
  it('detects a Capacitor Android AudioRoute plugin', () => {
    const root = {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        Plugins: {
          AudioRoute: {
            setRoute: async () => ({ ok: true, route: 'receiver' }),
            clearRoute: async () => undefined,
          },
        },
      },
    }

    expect(hasNativeAndroidAudioRoute(root)).toBe(true)
  })

  it('only reports success when Android confirms the requested route', async () => {
    const calls: string[] = []
    const root = {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        Plugins: {
          AudioRoute: {
            setRoute: async ({ route }: { route: string }) => {
              calls.push(route)
              return { ok: true, route }
            },
            clearRoute: async () => undefined,
          },
        },
      },
    }

    await expect(setNativeAndroidAudioRoute('receiver', root)).resolves.toBe(true)
    await expect(setNativeAndroidAudioRoute('speaker', root)).resolves.toBe(true)
    expect(calls).toEqual(['receiver', 'speaker'])
  })

  it('rejects a route when the native plugin reports another actual device', async () => {
    const root = {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        Plugins: {
          AudioRoute: {
            setRoute: async () => ({ ok: true, route: 'speaker' }),
            clearRoute: async () => undefined,
          },
        },
      },
    }

    await expect(setNativeAndroidAudioRoute('receiver', root)).resolves.toBe(false)
  })

  it('clears the Android communication-device override at call end', async () => {
    let cleared = 0
    const root = {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        Plugins: {
          AudioRoute: {
            setRoute: async () => ({ ok: true, route: 'receiver' }),
            clearRoute: async () => { cleared += 1 },
          },
        },
      },
    }

    await clearNativeAndroidAudioRoute(root)
    expect(cleared).toBe(1)
  })
})
