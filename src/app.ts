export const APP_LABEL = 'TEST' as const

export function getAppLabel(): typeof APP_LABEL {
  return APP_LABEL
}
