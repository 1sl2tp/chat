export type WebCallAudioRoute = 'receiver' | 'speaker' | 'system'

export function defaultCallRouteForWeb(userAgent: string): WebCallAudioRoute {
  if (/Android/i.test(userAgent)) return 'speaker'
  if (/iPhone/i.test(userAgent)) return 'receiver'
  return 'system'
}
