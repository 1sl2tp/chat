export type NativeAndroidAudioRoute = 'receiver' | 'speaker'

type NativeAudioRouteResult = {
  ok?: boolean
  route?: string
  deviceType?: number
  deviceName?: string
}

type NativeAudioRoutePlugin = {
  setRoute(options: { route: NativeAndroidAudioRoute }): Promise<NativeAudioRouteResult>
  clearRoute(): Promise<unknown>
  getRoute?: () => Promise<NativeAudioRouteResult>
}

type CapacitorLike = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: {
    AudioRoute?: NativeAudioRoutePlugin
  }
}

export type NativeAndroidRouteRoot = {
  Capacitor?: CapacitorLike
}

function pluginFor(root: NativeAndroidRouteRoot): NativeAudioRoutePlugin | null {
  const capacitor = root.Capacitor
  if (!capacitor?.isNativePlatform?.() || capacitor.getPlatform?.() !== 'android') return null
  return capacitor.Plugins?.AudioRoute ?? null
}

export function hasNativeAndroidAudioRoute(
  root: NativeAndroidRouteRoot = globalThis as unknown as NativeAndroidRouteRoot,
): boolean {
  return Boolean(pluginFor(root))
}

export async function setNativeAndroidAudioRoute(
  route: NativeAndroidAudioRoute,
  root: NativeAndroidRouteRoot = globalThis as unknown as NativeAndroidRouteRoot,
): Promise<boolean> {
  const plugin = pluginFor(root)
  if (!plugin) return false

  try {
    const result = await plugin.setRoute({ route })
    return result.ok === true && result.route === route
  } catch {
    return false
  }
}

export async function clearNativeAndroidAudioRoute(
  root: NativeAndroidRouteRoot = globalThis as unknown as NativeAndroidRouteRoot,
): Promise<void> {
  const plugin = pluginFor(root)
  if (!plugin) return
  try {
    await plugin.clearRoute()
  } catch {
    // Native route cleanup must not block call teardown.
  }
}
