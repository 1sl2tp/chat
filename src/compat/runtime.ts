export type RuntimeOs = 'ios' | 'android' | 'macos' | 'windows' | 'unknown'
export type RuntimeBrowser = 'safari' | 'chrome' | 'edge' | 'unknown'
export type RuntimeFormFactor = 'mobile' | 'desktop'
export type RuntimeAppMode = 'browser' | 'standalone'

export interface RuntimeInfo {
  os: RuntimeOs
  browser: RuntimeBrowser
  formFactor: RuntimeFormFactor
  appMode: RuntimeAppMode
}

export interface RuntimeProbeInput {
  userAgent: string
  platform: string
  maxTouchPoints: number
  standalone: boolean
}

export function classifyRuntime(input: RuntimeProbeInput): RuntimeInfo {
  const { userAgent, platform, maxTouchPoints, standalone } = input
  const isIPadDesktopUa = platform === 'MacIntel' && maxTouchPoints > 1

  let os: RuntimeOs = 'unknown'
  if (/Android/i.test(userAgent)) os = 'android'
  else if (/iPhone|iPad|iPod/i.test(userAgent) || isIPadDesktopUa) os = 'ios'
  else if (/Windows/i.test(userAgent) || /^Win/i.test(platform)) os = 'windows'
  else if (/Macintosh|Mac OS X/i.test(userAgent) || /^Mac/i.test(platform)) os = 'macos'

  let browser: RuntimeBrowser = 'unknown'
  if (/Edg\//i.test(userAgent)) browser = 'edge'
  else if (/Chrome\//i.test(userAgent) || /CriOS\//i.test(userAgent)) browser = 'chrome'
  else if (/Safari\//i.test(userAgent)) browser = 'safari'

  return {
    os,
    browser,
    formFactor: os === 'ios' || os === 'android' ? 'mobile' : 'desktop',
    appMode: standalone ? 'standalone' : 'browser',
  }
}
