export const APP_BASE_PATH = './' as const
export const PWA_APP_ID = './' as const

export function serviceWorkerAssetBase(scriptUrl: string): string {
  return new URL('./', scriptUrl).href
}
