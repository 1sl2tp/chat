import type { CapabilitySnapshot } from '../compat/capabilities'
import type { RuntimeInfo } from '../compat/runtime'

export interface BuildDiagnostics {
  version: string
  id: string
}

export interface MediaDiagnostics {
  microphone: string
  localTrack: string
  remoteTrack: string
  playback: string
  output: string
  connection: string
  ice: string
  candidate: string
  visibility: string
}

export interface DiagnosticsInput {
  build: BuildDiagnostics
  runtime: RuntimeInfo
  capabilities: CapabilitySnapshot
  media: MediaDiagnostics
}

export interface DiagnosticsSnapshot extends DiagnosticsInput {}

export function createDiagnosticsSnapshot(input: DiagnosticsInput): DiagnosticsSnapshot {
  return {
    build: input.build,
    runtime: input.runtime,
    capabilities: input.capabilities,
    media: input.media,
  }
}
