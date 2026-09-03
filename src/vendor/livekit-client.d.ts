declare module 'livekit-client' {
  export const Room: new (options: Record<string, unknown>) => unknown;
  export const RoomEvent: {
    TrackSubscribed: string;
    TrackUnsubscribed: string;
    Disconnected: string;
    AudioPlaybackStatusChanged: string;
  };
  export const Track: { Kind: { Audio: string; Video: string } };
}
