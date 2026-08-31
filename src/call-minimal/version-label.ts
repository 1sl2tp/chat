export const MINIMAL_CALL_TEST_VERSION = 'minimal-call-v1.3-ios-audio-session'

function shortTestVersion(testVersion: string): string {
  const match = testVersion.match(/minimal-call-v([^\s-]+)/i)
  return match ? `v${match[1]}` : testVersion
}

export function minimalCallVersionLabel(testVersion: string, buildId: string): string {
  const build = buildId.trim() ? buildId.trim().slice(0, 7) : 'local'
  return `${shortTestVersion(testVersion)} · build ${build}`
}
