export interface LiveKitCredentials {
  serverUrl: string;
  participantToken: string;
}

export interface LiveKitAudioHandlers {
  onRemoteAudio: () => void;
  onDisconnected: () => void;
}

export interface LiveKitAudioTransport {
  join(credentials: LiveKitCredentials, handlers: LiveKitAudioHandlers): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  startAudio(): Promise<void>;
  disconnect(): Promise<void>;
}

interface AudioElementLike { remove(): void; }
interface AudioHostLike { appendChild(node: AudioElementLike): unknown; }
interface RemoteTrackLike {
  kind: string;
  attach(): AudioElementLike;
  detach(): AudioElementLike[];
}
interface LocalParticipantLike {
  setMicrophoneEnabled(enabled: boolean, options?: AudioCaptureOptions): Promise<unknown>;
}
interface RoomLike {
  canPlaybackAudio: boolean;
  localParticipant: LocalParticipantLike;
  on(event: string, handler: (...args: unknown[]) => void): RoomLike;
  connect(url: string, token: string): Promise<void>;
  startAudio(): Promise<void>;
  disconnect(): Promise<void> | void;
}
export interface LiveKitSdkLike {
  Room: new (options: Record<string, unknown>) => RoomLike;
  RoomEvent: {
    TrackSubscribed: string;
    TrackUnsubscribed: string;
    Disconnected: string;
    AudioPlaybackStatusChanged: string;
  };
  Track: { Kind: { Audio: string } };
}
interface AudioCaptureOptions {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  channelCount: number;
}

const AUDIO_CAPTURE: AudioCaptureOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1
};

export class LiveKitJsAudioTransport implements LiveKitAudioTransport {
  #room: RoomLike | null = null;
  #remoteTracks = new Set<RemoteTrackLike>();
  #handlers: LiveKitAudioHandlers | null = null;
  #intentionalDisconnect = false;
  #connected = false;

  constructor(
    private readonly sdk: LiveKitSdkLike,
    private readonly host: AudioHostLike = defaultAudioHost()
  ) {}

  async join(credentials: LiveKitCredentials, handlers: LiveKitAudioHandlers): Promise<void> {
    if (this.#connected) await this.disconnect();
    this.#handlers = handlers;
    this.#intentionalDisconnect = false;
    const room = this.ensureRoom();
    await room.connect(credentials.serverUrl, credentials.participantToken);
    this.#connected = true;
    await room.localParticipant.setMicrophoneEnabled(true, { ...AUDIO_CAPTURE });
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.#room) return;
    await this.#room.localParticipant.setMicrophoneEnabled(!muted, muted ? undefined : { ...AUDIO_CAPTURE });
  }

  async startAudio(): Promise<void> {
    await this.ensureRoom().startAudio();
  }

  async disconnect(): Promise<void> {
    const room = this.#room;
    if (!room) {
      this.clearRemoteAudio();
      return;
    }
    this.#intentionalDisconnect = true;
    this.clearRemoteAudio();
    this.#room = null;
    this.#connected = false;
    await Promise.resolve(room.disconnect());
    this.#handlers = null;
    this.#intentionalDisconnect = false;
  }

  private ensureRoom(): RoomLike {
    if (this.#room) return this.#room;
    const room = new this.sdk.Room({
      audioCaptureDefaults: { ...AUDIO_CAPTURE },
      disconnectOnPageLeave: true
    });
    this.#room = room;
    room
      .on(this.sdk.RoomEvent.TrackSubscribed, (...args) => this.onTrackSubscribed(args[0]))
      .on(this.sdk.RoomEvent.TrackUnsubscribed, (...args) => this.onTrackUnsubscribed(args[0]))
      .on(this.sdk.RoomEvent.Disconnected, () => {
        this.#connected = false;
        this.clearRemoteAudio();
        if (!this.#intentionalDisconnect) this.#handlers?.onDisconnected();
      })
      .on(this.sdk.RoomEvent.AudioPlaybackStatusChanged, () => undefined);
    return room;
  }

  private onTrackSubscribed(value: unknown): void {
    const track = asRemoteTrack(value);
    if (!track || track.kind !== this.sdk.Track.Kind.Audio) return;
    this.#remoteTracks.add(track);
    const element = track.attach();
    this.host.appendChild(element);
    this.#handlers?.onRemoteAudio();
  }

  private onTrackUnsubscribed(value: unknown): void {
    const track = asRemoteTrack(value);
    if (!track || !this.#remoteTracks.has(track)) return;
    this.#remoteTracks.delete(track);
    detachAndRemove(track);
  }

  private clearRemoteAudio(): void {
    for (const track of this.#remoteTracks) detachAndRemove(track);
    this.#remoteTracks.clear();
  }
}

function asRemoteTrack(value: unknown): RemoteTrackLike | null {
  if (!value || typeof value !== 'object') return null;
  const track = value as Partial<RemoteTrackLike>;
  return typeof track.kind === 'string' && typeof track.attach === 'function' && typeof track.detach === 'function'
    ? track as RemoteTrackLike
    : null;
}

function detachAndRemove(track: RemoteTrackLike): void {
  for (const element of track.detach()) element.remove();
}

function defaultAudioHost(): AudioHostLike {
  if (typeof document === 'undefined' || !document.body) return { appendChild: () => undefined };
  return { appendChild: (node) => document.body.appendChild(node as unknown as Node) };
}
