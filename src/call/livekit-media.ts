import {
  LIVEKIT_TOKEN_SERVER_ID,
  assertLiveKitServerUrl,
  liveKitParticipantIdentity,
  liveKitRoomName,
} from './livekit-config'
import { playRemoteAudioElement } from './audio-playback'
import {
  resetCallAudioRoute,
  type CallNavigatorAudioSessionLike,
} from './audio-route'
import { setPhoneAudioRoute } from './audio-route-control'
import {
  clearNativeAndroidAudioRoute,
  hasNativeAndroidAudioRoute,
  setNativeAndroidAudioRoute,
} from './native-android-audio-route'
import { defaultCallRouteForWeb } from './platform-audio-route'
import { createOwnedRemoteAudio } from './remote-audio-owner'
import {
  beginCallMicrophoneCapture,
  publishCapturedMicrophone,
  waitForCapturedMicrophone,
} from './user-gesture-mic'

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
  mediaStreamTrack?: MediaStreamTrack
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

function callNavigator(): CallNavigatorAudioSessionLike {
  return navigator as unknown as CallNavigatorAudioSessionLike
}

export class LiveKitVoiceMedia {
  private room: LiveKitRoomLike | null = null
  private readonly attached = new Set<HTMLMediaElement>()
  private readonly remoteElementByTrack = new Map<LiveKitTrackLike, HTMLAudioElement>()
  private readonly callbacks: LiveKitMediaCallbacks
  private joined = false
  private microphoneCapture: Promise<MediaStream> | null = null
  private microphoneStream: MediaStream | null = null
  private speakerEnabled = false

  constructor(callbacks: LiveKitMediaCallbacks) {
    this.callbacks = callbacks
  }

  beginUserGesture(): void {
    if (this.microphoneStream || this.microphoneCapture) return
    if (!navigator.mediaDevices?.getUserMedia) {
      this.microphoneCapture = Promise.reject(new Error('microphone_capture_unsupported'))
      void this.microphoneCapture.catch(() => undefined)
      return
    }

    // Capture remains the first media operation on the user gesture. Native or
    // WebKit routing is touched only after getUserMedia has resolved.
    const capture = beginCallMicrophoneCapture({
      getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    })
    this.microphoneCapture = capture

    void capture.then((stream) => {
      if (this.microphoneCapture !== capture) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      this.microphoneStream = stream
      this.speakerEnabled = this.defaultSpeakerSelected()
      void this.applySelectedPhoneRoute()
    }).catch(() => undefined)
  }

  async startAudio(): Promise<void> {
    const room = this.ensureRoom()
    await this.applySelectedPhoneRoute()
    await room.startAudio()
    await this.replayAttachedAudio()
  }

  async join(context: LiveKitJoinContext): Promise<void> {
    if (this.joined) return

    const pendingCapture = this.microphoneCapture
    const microphoneStream = await waitForCapturedMicrophone(this.microphoneStream, pendingCapture)
    if (this.microphoneCapture !== pendingCapture && !this.microphoneStream) {
      for (const track of microphoneStream.getTracks()) track.stop()
      throw new Error('microphone_capture_cancelled')
    }
    this.microphoneStream = microphoneStream
    this.speakerEnabled = this.defaultSpeakerSelected()
    await this.applySelectedPhoneRoute()

    const livekit = sdk()
    const room = this.ensureRoom()
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

  canTogglePhoneSpeaker(): boolean {
    return hasNativeAndroidAudioRoute() || Boolean(callNavigator().audioSession)
  }

  defaultSpeakerSelected(): boolean {
    if (hasNativeAndroidAudioRoute()) return false
    return defaultCallRouteForWeb(navigator.userAgent) === 'speaker'
  }

  usesAndroidWebSpeakerDefault(): boolean {
    return defaultCallRouteForWeb(navigator.userAgent) === 'speaker' && !this.canTogglePhoneSpeaker()
  }

  async setSpeakerEnabled(enabled: boolean): Promise<boolean> {
    const previous = this.speakerEnabled
    this.speakerEnabled = enabled
    const changed = await this.applySelectedPhoneRoute()
    if (!changed) {
      this.speakerEnabled = previous
      return false
    }

    await this.replayAttachedAudio()
    return true
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
    await this.replayAttachedAudio()
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
    this.speakerEnabled = false
    this.room?.disconnect(true)
    this.room = null
    this.stopMicrophoneCapture()
    void clearNativeAndroidAudioRoute()
    resetCallAudioRoute(callNavigator())
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
      if (track.kind !== livekit.Track.Kind.Audio || !track.mediaStreamTrack) return
      this.callbacks.onRemoteAudioSubscribed()

      const element = createOwnedRemoteAudio(track.mediaStreamTrack)
      element.style.position = 'fixed'
      element.style.width = '1px'
      element.style.height = '1px'
      element.style.opacity = '0'
      element.style.pointerEvents = 'none'
      document.body.append(element)
      this.attached.add(element)
      this.remoteElementByTrack.set(track, element)
      void this.playElementOnSelectedRoute(element)
    })

    room.on(livekit.RoomEvent.TrackUnsubscribed, (track: LiveKitTrackLike) => {
      const element = this.remoteElementByTrack.get(track)
      if (!element) return
      this.remoteElementByTrack.delete(track)
      this.attached.delete(element)
      element.pause()
      element.srcObject = null
      element.remove()
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

  private async applySelectedPhoneRoute(): Promise<boolean> {
    const route = this.speakerEnabled ? 'speaker' : 'receiver'
    if (hasNativeAndroidAudioRoute()) {
      return setNativeAndroidAudioRoute(route)
    }
    return setPhoneAudioRoute(callNavigator(), route).ok
  }

  private async playElementOnSelectedRoute(element: HTMLMediaElement): Promise<void> {
    // Apply/confirm the selected route before the first remote frame. In a
    // packaged Android build the native plugin verifies AudioManager's current
    // communication device; on iPhone WebKit verifies AudioSession state.
    await this.applySelectedPhoneRoute()

    const first = await playRemoteAudioElement(element)
    if (first !== 'playing') {
      this.callbacks.onAudioPlaybackBlocked()
      return
    }

    // Remote playback itself can cause platform route recomputation. Reassert
    // and replay only when the platform confirms the requested route.
    const routeConfirmed = await this.applySelectedPhoneRoute()
    if (routeConfirmed) {
      element.pause()
      const replay = await playRemoteAudioElement(element)
      if (replay !== 'playing') {
        this.callbacks.onAudioPlaybackBlocked()
        return
      }
    }

    this.callbacks.onRemoteAudioPlaying()
  }

  private async replayAttachedAudio(): Promise<void> {
    for (const element of this.attached) {
      element.pause()
      await this.playElementOnSelectedRoute(element)
    }
  }

  private stopMicrophoneCapture(): void {
    for (const track of this.microphoneStream?.getTracks() ?? []) track.stop()
    this.microphoneStream = null
    this.microphoneCapture = null
  }

  private removeAttached(): void {
    for (const element of this.attached) {
      element.pause()
      element.srcObject = null
      element.remove()
    }
    this.attached.clear()
    this.remoteElementByTrack.clear()
  }
}
