export type Role = 'admin' | 'user';
export type RouteName = 'directory' | 'chat';
export type AccountType = 'guest' | 'customer';

export interface CustomerGroup {
  id: string;
  name: string;
  builtIn: boolean;
}

export interface Contact {
  id: string;
  name: string;
  initials: string;
  accountType: AccountType;
  customerGroupId: string | null;
  username: string | null;
  password: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
}

export type MessageKind = 'text' | 'image' | 'file' | 'audio' | 'system' | 'call';
export type DeliveryStatus = 'sending' | 'sent' | 'seen';
export type CallOutcome = 'completed' | 'unanswered' | 'cancelled';

export interface CallEventData {
  callerId: string;
  calleeId: string;
  outcome: CallOutcome;
  durationSeconds?: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  recipientId: string | null;
  kind: MessageKind;
  text?: string;
  time: string;
  status?: DeliveryStatus;
  images?: string[];
  fileName?: string;
  fileUrl?: string;
  audioDuration?: number;
  audioUrl?: string;
  replyTo?: string;
  replyToId?: string;
  call?: CallEventData;
}

export type CallPhase = 'idle' | 'ringing' | 'connecting' | 'connected' | 'ended';
export type CallDirection = 'outgoing' | 'incoming';

export interface CallState {
  phase: CallPhase;
  direction: CallDirection;
  peerId: string;
  peerName: string;
  peerInitials: string;
  muted: boolean;
  minimized: boolean;
  startedAt: number | null;
  initiatedAt: number | null;
}

export interface AppState {
  role: Role;
  route: RouteName;
  activeContactId: string | null;
  directoryFilter: string;
  directorySearch: string;
  directoryScrollTop: number;
  contacts: Contact[];
  groups: CustomerGroup[];
  messages: Record<string, ChatMessage[]>;
  call: CallState;
}
