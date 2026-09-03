import type { AppState, Contact, CustomerGroup } from './types.js';

export type Listener = (state: AppState) => void;

export class Store {
  #listeners = new Set<Listener>();
  constructor(public readonly state: AppState) {}

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  notify(): void {
    for (const listener of this.#listeners) listener(this.state);
  }
}

const now = new Date('2026-09-03T10:00:00+07:00');
const isoAt = (daysAgo: number, hour: number, minute: number): string => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

export function createInitialState(): AppState {
  const contacts: Contact[] = [
    { id: 'c1', name: 'Nguyễn Minh', initials: 'NM', accountType: 'customer', customerGroupId: null, username: 'nguyenminh', password: '••••••', lastMessage: 'Cho mình xin bảng giá mới nhé', lastMessageAt: isoAt(0, 9, 40), unread: 3 },
    { id: 'c2', name: 'Trần Lan', initials: 'TL', accountType: 'customer', customerGroupId: 'family', username: 'tranlan', password: '••••••', lastMessage: 'Cảm ơn bạn', lastMessageAt: isoAt(1, 17, 20), unread: 0 },
    { id: 'g1', name: 'Khách vãng lai 01', initials: 'K1', accountType: 'guest', customerGroupId: null, username: null, password: null, lastMessage: 'Mình muốn hỏi thêm', lastMessageAt: isoAt(0, 9, 12), unread: 1 },
    { id: 'g2', name: 'Khách vãng lai 02', initials: 'K2', accountType: 'guest', customerGroupId: null, username: null, password: null, lastMessage: 'Xin chào', lastMessageAt: isoAt(14, 14, 5), unread: 0 }
  ];

  const groups: CustomerGroup[] = [
    { id: 'customer', name: 'Khách hàng', builtIn: true },
    { id: 'family', name: 'Gia đình', builtIn: false },
    { id: 'guest', name: 'Vãng lai', builtIn: true }
  ];

  return {
    role: 'admin',
    route: 'directory',
    activeContactId: null,
    directoryFilter: 'customer',
    directorySearch: '',
    directoryScrollTop: 0,
    contacts,
    groups,
    messages: {},
    call: { phase: 'idle', direction: 'outgoing', peerId: '', peerName: '', peerInitials: '', muted: false, minimized: false, startedAt: null, initiatedAt: null }
  };
}

export function getContact(state: AppState, id: string): Contact {
  const contact = state.contacts.find((item) => item.id === id);
  if (!contact) throw new Error(`Unknown contact: ${id}`);
  return contact;
}

export function promoteGuest(state: AppState, id: string, credentials: { username: string; password: string }): Contact {
  const contact = getContact(state, id);
  if (contact.accountType !== 'guest') throw new Error('Only guests can be promoted');
  contact.accountType = 'customer';
  contact.customerGroupId = null;
  contact.username = credentials.username;
  contact.password = credentials.password;
  return contact;
}

export function assignCustomerGroup(state: AppState, contactId: string, groupId: string | null): Contact {
  const contact = getContact(state, contactId);
  if (contact.accountType !== 'customer') throw new Error('Guests cannot be classified into customer groups');
  if (groupId !== null) {
    const group = state.groups.find((item) => item.id === groupId && item.id !== 'guest');
    if (!group) throw new Error(`Unknown customer group: ${groupId}`);
  }
  contact.customerGroupId = groupId === 'customer' ? null : groupId;
  return contact;
}

export function addCustomerGroup(state: AppState, name: string): CustomerGroup {
  const clean = name.trim();
  if (!clean) throw new Error('Group name is required');
  const base = clean.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nhom';
  let id = base;
  let suffix = 2;
  while (state.groups.some((item) => item.id === id)) id = `${base}-${suffix++}`;
  const group = { id, name: clean, builtIn: false } satisfies CustomerGroup;
  state.groups.splice(Math.max(1, state.groups.length - 1), 0, group);
  return group;
}

export function deleteCustomerGroup(state: AppState, groupId: string): void {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group || group.builtIn) throw new Error('Built-in groups cannot be deleted');
  state.groups = state.groups.filter((item) => item.id !== groupId);
  for (const contact of state.contacts) {
    if (contact.customerGroupId === groupId) contact.customerGroupId = null;
  }
}

export function addCustomer(state: AppState, input: { name: string; username: string; password: string }): Contact {
  const cleanName = input.name.trim();
  const cleanUser = input.username.trim();
  if (!cleanName || !cleanUser || !input.password) throw new Error('Name, username and password are required');
  let id = `c-${Date.now().toString(36)}`;
  while (state.contacts.some((item) => item.id === id)) id = `${id}-x`;
  const initials = cleanName.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase() ?? '').join('').slice(0, 2) || 'KH';
  const contact: Contact = {
    id,
    name: cleanName,
    initials,
    accountType: 'customer',
    customerGroupId: null,
    username: cleanUser,
    password: input.password,
    lastMessage: 'Chưa có tin nhắn',
    lastMessageAt: new Date().toISOString(),
    unread: 0
  };
  state.contacts.unshift(contact);
  return contact;
}

export function updateCustomer(state: AppState, id: string, input: { name: string; username: string; password: string }): Contact {
  const contact = getContact(state, id);
  if (contact.accountType !== 'customer') throw new Error('Only customers have account details');
  const cleanName = input.name.trim();
  const cleanUser = input.username.trim();
  if (!cleanName || !cleanUser || !input.password) throw new Error('Name, username and password are required');
  contact.name = cleanName;
  contact.username = cleanUser;
  contact.password = input.password;
  return contact;
}

export function deleteContact(state: AppState, id: string): void {
  const index = state.contacts.findIndex((item) => item.id === id);
  if (index < 0) return;
  state.contacts.splice(index, 1);
  delete state.messages[id];
  if (state.activeContactId === id) state.activeContactId = null;
}

export function bulkDeleteGuests(state: AppState): number {
  const before = state.contacts.length;
  state.contacts = state.contacts.filter((item) => item.accountType !== 'guest');
  return before - state.contacts.length;
}
