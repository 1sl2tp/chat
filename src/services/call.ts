export interface LiveCallStartInput {
  conversationId: string;
  peerId: string;
  peerName: string;
  peerInitials: string;
}

export interface LiveCallConfiguration {
  localProfileId: string;
  deviceId: string;
}

export interface CallRuntimePeer {
  peerId: string;
  peerName: string;
  peerInitials: string;
  direction: 'outgoing' | 'incoming';
}

export type CallRuntimeEvent =
  | { type: 'incoming'; peerId: string; peerName: string; peerInitials: string }
  | ({ type: 'connecting' } & Partial<CallRuntimePeer>)
  | ({ type: 'connected' } & Partial<CallRuntimePeer>)
  | { type: 'ended' };

export interface CallService {
  configure(input: LiveCallConfiguration): void;
  start(): Promise<void>;
  stop(): Promise<void> | void;
  subscribe(listener: (event: CallRuntimeEvent) => void): () => void;
  startOutgoing(input: LiveCallStartInput): Promise<void>;
  acceptIncoming(): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  startAudio(): Promise<void>;
  end(): Promise<void>;
}
