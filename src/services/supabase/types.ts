import type { CallEventData } from '../../app/types.js';

export type SupabaseMessageType = 'text' | 'image' | 'file' | 'audio' | 'call';

export interface SupabaseAttachment {
  kind: 'image' | 'file' | 'audio';
  name: string;
  mime: string;
  path: string;
  size: number;
  durationSeconds?: number;
  duration_seconds?: number;
  group_id?: string;
  group_index?: number;
  group_total?: number;
  reply_to_id?: string;
}

export interface SupabaseMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_message_id: string;
  type: string;
  text: string | null;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  revoked_at: string | null;
  call_id: string | null;
  attachment: SupabaseAttachment | null;
}

export interface SupabaseCallRow {
  id: string;
  caller_profile_id: string;
  callee_profile_id: string;
  state: string;
  connected_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
}

export interface MessageMapContext {
  localProfileId: string;
  peerProfileId: string;
  peerLastReadAt?: string | null;
  attachmentUrls?: ReadonlyMap<string, string>;
  callRows?: ReadonlyMap<string, SupabaseCallRow>;
  formatTime?: (iso: string) => string;
}

export interface BootstrapIdentity {
  profile: { id: string; display_name: string; username: string | null; avatar_url: string | null };
  device_id: string;
  auth_session_id: string;
  is_anonymous: boolean;
}

export interface ResolvedIdentity {
  kind: 'admin' | 'guest_customer' | 'registered_customer';
  profile_id: string;
  auth_user_id: string;
  is_admin: boolean;
}

export interface AdminInboxRow {
  conversation_id: string;
  profile_id: string;
  display_name: string;
  username: string | null;
  user_level: number;
  identity_type: string;
  address: string | null;
  customer_last_seen_at: string | null;
  last_message_at: string | null;
  last_message_text: string | null;
  last_message_type: string | null;
  unread_count: number;
}

export interface SupportEntry {
  conversation_id: string | null;
  support_conversation: string | null;
  admin_profile?: { id: string; display_name: string; username?: string | null; avatar_url?: string | null };
  admin?: { id: string; display_name: string; username?: string | null; avatar_url?: string | null };
}

export interface MappedCall {
  id: string;
  data: CallEventData;
}
