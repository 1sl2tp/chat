import type { Contact, Role } from '../app/types.js';
import type { AuthBootstrapResult } from '../services/supabase/auth-service.js';
import type { AdminDirectoryEntry } from '../services/supabase/chat-service.js';

export interface RuntimeSessionModel {
  role: Role;
  localProfileId: string;
  deviceId: string;
  profile: { name: string; username: string | null };
  contacts: Contact[];
  support: Contact | null;
  conversationIds: ReadonlyMap<string, string>;
}

export function buildUserRuntimeSession(auth: AuthBootstrapResult): RuntimeSessionModel {
  if (auth.identity.is_admin || auth.identity.kind === 'admin') throw new Error('user runtime requires non-admin identity');
  const supportProfile = auth.support.admin_profile ?? auth.support.admin;
  const conversationId = auth.support.conversation_id ?? auth.support.support_conversation;
  if (!supportProfile?.id || !conversationId) throw new Error('support conversation required');
  const support = contactFromSupport(supportProfile);
  return {
    role: 'user',
    localProfileId: auth.identity.profile_id,
    deviceId: auth.bootstrap.device_id,
    profile: { name: auth.bootstrap.profile.display_name, username: auth.bootstrap.profile.username },
    contacts: [],
    support,
    conversationIds: new Map([[support.id, conversationId]])
  };
}

export function buildAdminRuntimeSession(auth: AuthBootstrapResult, entries: readonly AdminDirectoryEntry[]): RuntimeSessionModel {
  if (!auth.identity.is_admin && auth.identity.kind !== 'admin') throw new Error('admin runtime requires admin identity');
  return {
    role: 'admin',
    localProfileId: auth.identity.profile_id,
    deviceId: auth.bootstrap.device_id,
    profile: { name: auth.bootstrap.profile.display_name, username: auth.bootstrap.profile.username },
    contacts: entries.map((entry) => entry.contact),
    support: null,
    conversationIds: new Map(entries.map((entry) => [entry.contact.id, entry.conversationId]))
  };
}

function contactFromSupport(profile: { id: string; display_name: string; username?: string | null }): Contact {
  return {
    id: profile.id,
    name: profile.display_name,
    initials: initials(profile.display_name),
    accountType: 'customer',
    customerGroupId: null,
    username: profile.username ?? 'admin',
    password: null,
    lastMessage: '',
    lastMessageAt: new Date().toISOString(),
    unread: 0
  };
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase() ?? '').join('').slice(0, 2) || 'HT';
}
