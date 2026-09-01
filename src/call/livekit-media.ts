import {
  LIVEKIT_TOKEN_SERVER_ID,
  assertLiveKitServerUrl,
  liveKitParticipantIdentity,
  liveKitRoomName,
} from './livekit-config'
import { playRemoteAudioElement } from './audio-playback'
import { beginCallMicrophoneCapture, publishCapturedMicrophone } from './user-gesture-mic'

export interface LiveKitJoinContext {
  callId: string
  profileId: string
  deviceId: string
  displayName: string
}

export interface LiveKitMediaCallbacks {
  onPeerConnected(): void
  onPeerDisconnected(): void
  onRemoteAudioSubscribed(): void
  onRemoteAudioPlaying(): void
  onAudioPlaybackBlocked(): void
  onError(error: Error): void
}

type LiveKitTrackLike = {
  kind?: string
  attach(): HTMLElement
  detach(): HTMLElement[]
}

type LiveKitRoomLike = {
  canPlaybackAudio: boolean
  remoteParticipants?: { size: number }
  localParticipant: {
    publishTrack(track: MediaStreamTrack, options?: { source?: string }): Promise<unknown>
    setMicrophoneEnabled(enabled: boolean): Promise<unknown>
  }
  connect(serverUrl: string, token: string): Promise<unknown>
  disconnect(stopTracks?: boolean): void
  startAudio(): Promise<void>
  switchActiveDevice(kind: MediaDeviceKind, deviceId: string, exact?: boolean): Promise<unknown>
  on(event: string, listener: (...args: any[]) => void): LiveKitRoomLike
}

type LiveKitGlobal = {
  Room: new (options?: Record<string, unknown>) => LiveKitRoomLike
  RoomEvent: {
    TrackSubscribed: string
    TrackUnsubscribed: string
    ParticipantConnected: string
    ParticipantDisconnected: string
    AudioPlaybackStatusChanged: string
    Disconnected: string
    Reconnecting: string
    Reconnected: string
  }
  Track: {
    Kind: { Audio: string }
    Source: { Microphone: string }
  }
  TokenSource: {
    developmentTokenServer(id: string): {
      fetch(options: {
        roomName: string
        participantIdentity: string
        participantName: string
      }): Promise<{ serverUrl: string; participantToken: string }>
    }
  }
  supportsAudioOutputSelection?: () => boolean
}

declare global {
  interface Window {
    LivekitClient?: LiveKitGlobal
  }
}

function sdk(): LiveKitGlobal {
  const value = window.LivekitClient
  if (!value) throw new Error('livekit_sdk_missing')
  return value
}

export class LiveKitVoiceMedia {
  private room: LiveKitRoomLike | null = null
  private readonly attached = new Set<HTMLElement>()
  private readonly callbacks: LiveKitMediaCallbacks
  private joined = false
  private microphoneCapture: Promise<MediaStream> | null = null
  private microphoneStream: MediaStream | null = null

  constructor(callbacks: LiveKitMediaCallbacks) {
    this.callbacks = callbacks
  }

  async beginUserGesture(): Promise<void> {
    if (!this.microphoneStream) {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('microphone_capture_unsupported')
      if (!this.microphoneCapture) {
        this.microphoneCapture = beginCallMicrophoneCapture({
          getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
        })
      }
      this.microphoneStream = await this.microphoneCapture
    }

    // Only touch LiveKit playback after iOS has returned a real microphone stream.
    // This preserves the working order proven by /mic-test/: gUM first, everything else second.
    const room = this.ensureRoom()
    void room.startAudio().catch(() => undefined)
  }

  async startAudio(): Promise<void> {
    const room = this.ensureRoom()
    await room.startAudio()
    for (const element of this.attached) {
      if (!(element instanceof HTMLMediaElement)) continue
      const result = await playRemoteAudioElement(element)
      if (result === 'playing') this.callbacks.onRemoteAudioPlaying()
      else this.callbacks.onAudioPlaybackBlocked()
    }
  }

  async join(context: LiveKitJoinContext): Promise<void> {
    if (this.joined) return
    const livekit = sdk()
    const room = this.ensureRoom()
    const microphoneStream = this.microphoneStream
    if (!microphoneStream) throw new Error('microphone_not_prepared')

    const source = livekit.TokenSource.developmentTokenServer(LIVEKIT_TOKEN_SERVER_ID)
    const credentials = await source.fetch({
      roomName: liveKitRoomName(context.callId),
      participantIdentity: liveKitParticipantIdentity(context.profileId, context.deviceId),
      participantName: context.displayName || 'TAPHOA Chat',
    })

    assertLiveKitServerUrl(credentials.serverUrl)
    await room.connect(credentials.serverUrl, credentials.participantToken)
    await publishCapturedMicrophone(
      microphoneStream,
      livekit.Track.Source.Microphone,
      (track, options) => room.localParticipant.publishTrack(track, options),
    )
    this.joined = true

    if ((room.remoteParticipants?.size ?? 0) > 0) this.callbacks.onPeerConnected()
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.room || !this.joined) return
    await this.room.localParticipant.setMicrophoneEnabled(!muted)
  }

  async chooseAudioOutput(): Promise<boolean> {
    const room = this.room
    if (!room || !this.joined) return false
    const livekit = sdk()
    if (livekit.supportsAudioOutputSelection && !livekit.supportsAudioOutputSelection()) return false

    const devices = navigator.mediaDevices as MediaDevices & {
      selectAudioOutput?: () => Promise<MediaDeviceInfo>
    }
    if (typeof devices.selectAudioOutput !== 'function') return false

    const output = await devices.selectAudioOutput()
    await room.switchActiveDevice('audiooutput', output.deviceId, true)
    return true
  }

  canChooseAudioOutput(): boolean {
    const livekit = window.LivekitClient
    if (!livekit) return false
    if (typeof livekit.supportsAudioOutputSelection === 'function') {
      return livekit.supportsAudioOutputSelection()
    }
    return typeof (navigator.mediaDevices as MediaDevices & { selectAudioOutput?: unknown }).selectAudioOutput === 'function'
  }

  disconnect(): void {
    this.joined = false
    this.room?.disconnect(true)
    this.room = null
    this.stopMicrophoneCapture()
    this.removeAttached()
  }

  private ensureRoom(): LiveKitRoomLike {
    if (this.room) return this.room
    const livekit = sdk()
    const room = new livekit.Room({
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    room.on(livekit.RoomEvent.TrackSubscribed, (track: LiveKitTrackLike) => {
      if (track.kind !== livekit.Track.Kind.Audio) return
      this.callbacks.onRemoteAudioSubscribed()
      const element = track.attach()
      element.style.position = 'fixed'
      element.style.width = '1px'
      element.style.height = '1px'
      element.style.opacity = '0'
      element.style.pointerEvents = 'none'
      document.body.append(element)
      this.attached.add(element)

      if (element instanceof HTMLMediaElement) {
        void playRemoteAudioElement(element).then((result) => {
          if (result === 'playing') this.callbacks.onRemoteAudioPlaying()
          else this.callbacks.onAudioPlaybackBlocked()
        })
      } else if (!room.canPlaybackAudio) {
        this.callbacks.onAudioPlaybackBlocked()
      }
    })

    room.on(livekit.RoomEvent.TrackUnsubscribed, (track: LiveKitTrackLike) => {
      for (const element of track.detach()) {
        this.attached.delete(element)
        element.remove()
      }
    })

    room.on(livekit.RoomEvent.ParticipantConnected, () => this.callbacks.onPeerConnected())
    room.on(livekit.RoomEvent.ParticipantDisconnected, () => this.callbacks.onPeerDisconnected())
    room.on(livekit.RoomEvent.AudioPlaybackStatusChanged, () => {
      if (!room.canPlaybackAudio) this.callbacks.onAudioPlaybackBlocked()
    })
    room.on(livekit.RoomEvent.Disconnected, () => this.callbacks.onPeerDisconnected())
    room.on(livekit.RoomEvent.Reconnecting, () => undefined)
    room.on(livekit.RoomEvent.Reconnected, () => {
      if ((room.remoteParticipants?.size ?? 0) > 0) this.callbacks.onPeerConnected()
    })

    this.room = room
    return room
  }

  private stopMicrophoneCapture(): void {
    for (const track of this.microphoneStream?.getTracks() ?? []) track.stop()
    this.microphoneStream = null
    this.microphoneCapture = null
  }

  private removeAttached(): void {
    for (const element of this.attached) element.remove()
    this.attached.clear()
  }
}
