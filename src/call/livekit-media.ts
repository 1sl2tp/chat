import {
  Room,
  RoomEvent,
  Track,
  supportsAudioOutputSelection,
  type RemoteTrack,
} from 'livekit-client'
import { assertLiveKitServerUrl } from './livekit-config'
import { playRemoteAudioElement } from './audio-playback'
import {
  resetCallAudioRoute,
  type CallNavigatorAudioSessionLike,
} from './audio-route'
import { setPhoneAudioRoute } from './audio-route-control'
import {
  collectMicrophoneProcessingDiagnostics,
  type MicrophoneProcessingDiagnostics,
} from './diagnostics'
import {
  clearNativeAndroidAudioRoute,
  hasNativeAndroidAudioRoute,
  setNativeAndroidAudioRoute,
} from './native-android-audio-route'
import {
  readMicrophonePermission,
  type MicrophonePermissionState,
} from './microphone-permission'
import { defaultCallRouteForWeb } from './platform-audio-route'
import { createOwnedRemoteAudio } from './remote-audio-owner'
import {
  beginCallMicrophoneCapture,
  publishCapturedMicrophone,
  waitForCapturedMicrophone,
} from './user-gesture-mic'

export interface LiveKitJoinCredentials {
  serverUrl: string
  participantToken: string
}

export interface LiveKitMediaCallbacks {
  onPeerConnected(): void
  onPeerDisconnected(): void
  onReconnecting(): void
  onReconnected(): void
  onRemoteAudioSubscribed(): void
  onRemoteAudioPlaying(): void
  onAudioPlaybackBlocked(): void
  onMicrophonePermissionState(state: MicrophonePermissionState): void
  onError(error: Error): void
}

function callNavigator(): CallNavigatorAudioSessionLike {
  return navigator as unknown as CallNavigatorAudioSessionLike
}

export async function connectRoomWhileCapturing<T>(
  waitForMicrophone: () => Promise<T>,
  connectRoom: () => Promise<void>,
): Promise<T> {
  const microphoneTask = waitForMicrophone()
  const roomTask = connectRoom()
  const [microphone] = await Promise.all([microphoneTask, roomTask])
  return microphone
}

export class LiveKitVoiceMedia {
  private room: Room | null = null
  private readonly attached = new Set<HTMLMediaElement>()
  private readonly remoteElementByTrack = new Map<RemoteTrack, HTMLAudioElement>()
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

    // Capture remains the first media operation on the user gesture. Permission
    // inspection starts only after getUserMedia has already been invoked, so it
    // cannot consume or delay the user gesture that iPhone Safari needs.
    const capture = beginCallMicrophoneCapture({
      getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    })
    this.microphoneCapture = capture
    void readMicrophonePermission(navigator.permissions)
      .then((state) => this.callbacks.onMicrophonePermissionState(state))

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

  async resumeAfterForeground(): Promise<void> {
    const room = this.room
    if (!room || !this.joined) return
    await this.applySelectedPhoneRoute()
    await room.startAudio()
    await this.replayAttachedAudio()
  }

  async join(credentials: LiveKitJoinCredentials): Promise<void> {
    if (this.joined) return

    const pendingCapture = this.microphoneCapture
    const room = this.ensureRoom()
    assertLiveKitServerUrl(credentials.serverUrl)

    // getUserMedia has already been invoked by beginUserGesture(). Waiting for
    // that capture and connecting the room can therefore proceed concurrently
    // without violating the iPhone first-media-operation contract.
    const microphoneStream = await connectRoomWhileCapturing(
      () => waitForCapturedMicrophone(this.microphoneStream, pendingCapture),
      () => room.connect(credentials.serverUrl, credentials.participantToken),
    )

    if (this.microphoneCapture !== pendingCapture && !this.microphoneStream) {
      for (const track of microphoneStream.getTracks()) track.stop()
      throw new Error('microphone_capture_cancelled')
    }
    this.microphoneStream = microphoneStream
    this.speakerEnabled = this.defaultSpeakerSelected()
    await this.applySelectedPhoneRoute()

    await publishCapturedMicrophone(
      microphoneStream,
      Track.Source.Microphone,
      (track) => room.localParticipant.publishTrack(track, { source: Track.Source.Microphone }),
    )
    this.joined = true

    if (room.remoteParticipants.size > 0) this.callbacks.onPeerConnected()
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.room || !this.joined) return
    await this.room.localParticipant.setMicrophoneEnabled(!muted)
  }

  microphoneProcessingDiagnostics(): Readonly<MicrophoneProcessingDiagnostics> {
    return collectMicrophoneProcessingDiagnostics(this.microphoneStream?.getAudioTracks()[0] ?? null)
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
    if (!room || !this.joined || !supportsAudioOutputSelection()) return false

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
    if (!supportsAudioOutputSelection()) return false
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

  private ensureRoom(): Room {
    if (this.room) return this.room
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== Track.Kind.Audio || !track.mediaStreamTrack) return
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

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      const element = this.remoteElementByTrack.get(track)
      if (!element) return
      this.remoteElementByTrack.delete(track)
      this.attached.delete(element)
      element.pause()
      element.srcObject = null
      element.remove()
    })

    room.on(RoomEvent.ParticipantConnected, () => {
      // A participant can arrive while local microphone capture is still being
      // resolved. Do not mark the call active until local publish is complete;
      // join() will re-check remoteParticipants immediately after that point.
      if (this.joined) this.callbacks.onPeerConnected()
    })
    room.on(RoomEvent.ParticipantDisconnected, () => this.callbacks.onPeerDisconnected())
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (!room.canPlaybackAudio) this.callbacks.onAudioPlaybackBlocked()
    })
    room.on(RoomEvent.Disconnected, () => this.callbacks.onPeerDisconnected())
    room.on(RoomEvent.Reconnecting, () => this.callbacks.onReconnecting())
    room.on(RoomEvent.Reconnected, () => this.callbacks.onReconnected())

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
    await this.applySelectedPhoneRoute()

    const first = await playRemoteAudioElement(element)
    if (first !== 'playing') {
      this.callbacks.onAudioPlaybackBlocked()
      return
    }

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