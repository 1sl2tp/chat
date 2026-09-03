import { assignCustomerGroup, createInitialState, deleteContact, getContact } from './app/store.js';
import { Store } from './app/store.js';
import type { ChatMessage, Contact, Role } from './app/types.js';
import { AppShell } from './app/shell.js';
import { Router } from './app/router.js';
import { ViewportController } from './app/viewport.js';
import { OverlayManager, destructiveConfirmCopy } from './app/overlay-manager.js';
import { DirectoryScreen, type DirectoryCallbacks } from './directory/directory-screen.js';
import { ChatScreen } from './chat/chat-screen.js';
import { AdminWorkspace } from './admin/admin-workspace.js';
import { CallController } from './call/call-controller.js';
import { NotificationQueue } from './services/notifications.js';
import { icon } from './ui/icons.js';
import { AuthGate } from './auth/auth-gate.js';
import type { ChatConversationSource } from './chat/live-conversation.js';
import { readBundledSupabaseConfig } from './services/supabase/config.js';
import type { SupabaseChatService } from './services/supabase/chat-service.js';
import type { SupabaseAuthService } from './services/supabase/auth-service.js';
import type { SupabaseAdminDirectoryService } from './services/supabase/admin-directory-service.js';
import type { SupabaseVoiceCallService } from './services/supabase/voice-call-service.js';
import type { TaphoaPushService } from './services/pwa/push-service.js';
import { createLiveSupabaseServices } from './runtime/live-services.js';
import type { LiveRuntimeBootstrap } from './runtime/live-runtime-bootstrap.js';
import { SupabaseConversationSource } from './runtime/supabase-conversation-source.js';
import type { RuntimeSessionModel } from './runtime/session-model.js';
import { notificationCallId, notificationConversationId, notificationPayloadFromSearch, type PushNavigationPayload } from './runtime/push-navigation.js';

const root = document.getElementById('app-root');
const overlayRoot = document.getElementById('overlay-root');
if (!root || !overlayRoot) throw new Error('Missing app roots');
const appRoot: HTMLElement = root;
const overlaysEl: HTMLElement = overlayRoot;

const state = createInitialState();
const store = new Store(state);
const shell = new AppShell(appRoot);
const overlays = new OverlayManager(overlaysEl);
const viewport = new ViewportController();
const router = new Router({ name: state.route, contactId: state.activeContactId });
const desktopAdmin = window.matchMedia('(min-width: 900px)');

let notificationHide: number | null = null;
const notifications = new NotificationQueue((item) => {
  const card = document.createElement('div');
  card.className = 'status-card notification-card';
  card.innerHTML = `<span class="avatar s">!</span><span class="status-copy"><strong>${escapeHtml(item.text)}</strong>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ''}</span>`;
  shell.setTopStatus(card);
  if (notificationHide !== null) window.clearTimeout(notificationHide);
  notificationHide = window.setTimeout(() => shell.setTopStatus(null), 2600);
});

const defaultSupport: Contact = { id: 'support', name: 'Hỗ trợ', initials: 'HT', accountType: 'customer', customerGroupId: null, username: 'admin', password: null, lastMessage: '', lastMessageAt: new Date().toISOString(), unread: 0 };
let support: Contact = defaultSupport;
const userProfile = { name: 'Người dùng', username: 'khachhang', password: '••••••' };

let currentDirectory: DirectoryScreen | null = null;
let currentChat: ChatScreen | null = null;
let currentWorkspace: AdminWorkspace | null = null;
let runtimeSession: RuntimeSessionModel | null = null;
let liveBootstrap: LiveRuntimeBootstrap | null = null;
let liveAuthService: SupabaseAuthService | null = null;
let liveChatService: SupabaseChatService | null = null;
let liveAdminDirectory: SupabaseAdminDirectoryService | null = null;
let liveCallService: SupabaseVoiceCallService | null = null;
let livePushService: TaphoaPushService | null = null;
let pendingPushPayload: PushNavigationPayload | null = notificationPayloadFromSearch(location.search);

const calls = new CallController(store, overlays, shell, notifications, {
  localParticipantId: () => localParticipantId(),
  onHistoryEvent: (peerId, message) => appendCallHistory(peerId, message),
  onError: (error) => notifications.notify({ text: 'Cuộc gọi gặp lỗi', detail: error.message })
});

router.subscribe((route) => {
  state.route = route.name;
  state.activeContactId = route.contactId;
  mountRoute();
});
desktopAdmin.addEventListener('change', () => mountRoute());

viewport.start();
bindEdgeSwipe();
bindPushNavigationMessages();
void bootRuntime();

async function bootRuntime(): Promise<void> {
  const config = readBundledSupabaseConfig();
  if (!config) {
    if (isExplicitDemoMode()) startMockRuntime();
    else showConfigurationError();
    return;
  }
  try {
    const services = await createLiveSupabaseServices(config);
    liveBootstrap = services.bootstrap;
    liveAuthService = services.auth;
    liveChatService = services.chat;
    liveAdminDirectory = services.adminDirectory;
    liveCallService = services.call;
    livePushService = services.push;
    const restored = await liveBootstrap.restore(runtimeDevice());
    if (restored) activateLiveSession(restored);
    else showAuthGate();
  } catch (error) {
    showAuthGate(error);
  }
}

function isExplicitDemoMode(): boolean {
  const runtime = globalThis as typeof globalThis & { __TAPHOA_DEMO__?: boolean };
  return runtime.__TAPHOA_DEMO__ === true || new URLSearchParams(location.search).get('demo') === '1';
}

function showConfigurationError(): void {
  calls.bindService(null);
  appRoot.classList.add('auth-mode');
  clearMounted();
  const panel = document.createElement('section');
  panel.className = 'screen auth-gate';
  panel.innerHTML = '<div class="auth-card"><strong>Chưa cấu hình kết nối</strong><p>TAPHOA cần Supabase URL và publishable key từ bản build.</p></div>';
  shell.mountScreen(panel);
  markReady();
}

function startMockRuntime(): void {
  runtimeSession = null;
  liveBootstrap = null;
  liveAuthService = null;
  liveChatService = null;
  liveAdminDirectory = null;
  liveCallService = null;
  livePushService = null;
  calls.bindService(null);
  support = defaultSupport;
  state.role = resolveRole();
  state.route = state.role === 'admin' ? 'directory' : 'chat';
  appRoot.classList.remove('auth-mode');
  mountRoute();
  markReady();
}

function showAuthGate(initialError?: unknown): void {
  calls.bindService(null);
  appRoot.classList.add('auth-mode');
  clearMounted();
  const gate = new AuthGate({
    onGuest: async () => {
      if (!liveBootstrap) throw new Error('Supabase runtime unavailable');
      activateLiveSession(await liveBootstrap.continueAsGuest(runtimeDevice()));
    },
    onLogin: async (username, password) => {
      if (!liveBootstrap) throw new Error('Supabase runtime unavailable');
      activateLiveSession(await liveBootstrap.login(username, password, runtimeDevice()));
    }
  });
  shell.mountScreen(gate.root);
  if (initialError) gate.showError(initialError);
  markReady();
}

function activateLiveSession(session: RuntimeSessionModel): void {
  runtimeSession = session;
  state.role = session.role;
  state.route = session.role === 'admin' ? 'directory' : 'chat';
  state.activeContactId = null;
  state.contacts = [...session.contacts];
  state.groups = [{ id: 'customer', name: 'Khách hàng', builtIn: true }, { id: 'guest', name: 'Vãng lai', builtIn: true }];
  state.messages = {};
  state.directoryFilter = 'customer';
  state.directorySearch = '';
  support = session.support ?? defaultSupport;
  userProfile.name = session.profile.name;
  userProfile.username = session.profile.username ?? '';
  userProfile.password = '••••••';
  appRoot.classList.remove('auth-mode');
  calls.bindService(liveCallService, { localProfileId: session.localProfileId, deviceId: session.deviceId }, (peerId) => runtimeSession?.conversationIds.get(peerId) ?? null);
  if (livePushService) void livePushService.start(session.deviceId).catch((error) => notifyPushError(error));
  mountRoute();
  if (session.role === 'admin' && liveAdminDirectory) void refreshAdminDirectory().catch((error) => notifySyncError(error));
  consumePendingPushNavigation();
  markReady();
}

function runtimeDevice(): { label: string; platform: string; legacyGuestToken: null } {
  const ua = navigator.userAgent.toLowerCase();
  const platform = /iphone|ipad|ipod/.test(ua) ? 'ios' : /android/.test(ua) ? 'android' : 'web';
  return { label: navigator.platform || 'Web', platform, legacyGuestToken: null };
}

function notifySyncError(error: Error): void {
  notifications.notify({ text: 'Không đồng bộ được tin nhắn', detail: error.message });
}

function markReady(): void {
  document.documentElement.dataset.appReady = 'true';
}

function localParticipantId(): string {
  return runtimeSession?.localProfileId ?? (state.role === 'admin' ? 'admin' : 'user');
}

function conversationSourceFor(peer: Contact): ChatConversationSource | undefined {
  if (!runtimeSession || !liveChatService) return undefined;
  const conversationId = runtimeSession.conversationIds.get(peer.id);
  if (!conversationId) return undefined;
  return new SupabaseConversationSource(liveChatService, { conversationId, localProfileId: runtimeSession.localProfileId, peerProfileId: peer.id });
}

function directoryManagementCallbacks(onOpenContact: (contact: Contact) => void): DirectoryCallbacks {
  return {
    onOpenContact,
    management: liveAdminDirectory ?? undefined,
    onManagedChange: refreshAdminDirectory,
    onError: (error) => notifySyncError(error)
  };
}

async function refreshAdminDirectory(): Promise<void> {
  if (!runtimeSession || runtimeSession.role !== 'admin' || !liveChatService) return;
  const [entries, groups] = await Promise.all([
    liveChatService.loadAdminDirectory(),
    liveAdminDirectory?.loadGroups() ?? Promise.resolve([])
  ]);
  const assignmentByProfile = new Map<string, string>();
  for (const group of groups) for (const profileId of group.profileIds) assignmentByProfile.set(profileId, group.id);
  const contacts = entries.map((entry) => ({
    ...entry.contact,
    customerGroupId: entry.contact.accountType === 'customer' ? (assignmentByProfile.get(entry.contact.id) ?? null) : null
  }));
  state.groups = [
    { id: 'customer', name: 'Khách hàng', builtIn: true },
    ...groups.map((group) => ({ id: group.id, name: group.name, builtIn: false })),
    { id: 'guest', name: 'Vãng lai', builtIn: true }
  ];
  if (!state.groups.some((group) => group.id === state.directoryFilter)) state.directoryFilter = 'customer';
  runtimeSession = {
    ...runtimeSession,
    contacts,
    conversationIds: new Map(entries.map((entry) => [entry.contact.id, entry.conversationId]))
  };
  state.contacts = contacts;
  if (state.activeContactId && !contacts.some((contact) => contact.id === state.activeContactId)) state.activeContactId = null;
  store.notify();
  mountRoute();
}

function clearMounted(): void {
  currentDirectory?.unmount();
  currentDirectory = null;
  currentChat?.unmount();
  currentChat = null;
  currentWorkspace?.unmount();
  currentWorkspace = null;
}

function mountRoute(): void {
  clearMounted();

  if (state.role === 'admin' && desktopAdmin.matches) {
    const initial = state.activeContactId
      ? getContact(state, state.activeContactId)
      : state.contacts.find((contact) => contact.accountType === 'customer') ?? state.contacts[0] ?? null;
    if (initial) state.activeContactId = initial.id;
    const workspace = new AdminWorkspace(store, overlays, {
      localParticipantId: localParticipantId(),
      conversationSourceFor: (peer) => conversationSourceFor(peer),
      directoryManagement: liveAdminDirectory ?? undefined,
      onDirectoryChanged: refreshAdminDirectory,
      onPeerChange: (peer) => setAdminDesktopHeader(peer),
      onCallBack: (peer) => calls.startOutgoing(peer),
      onError: (error) => notifySyncError(error)
    });
    currentWorkspace = workspace;
    shell.mountScreen(workspace.mount(initial));
    if (initial) setAdminDesktopHeader(initial);
    else shell.setHeader({ title: 'Danh bạ', subtitle: 'Khách hàng', leadingIcon: 'contacts' });
    return;
  }

  if (state.role === 'admin' && state.route === 'directory') {
    shell.setHeader({ title: 'Danh bạ', subtitle: 'Khách hàng', leadingIcon: 'contacts' });
    const directory = new DirectoryScreen(store, overlays, directoryManagementCallbacks((contact) => router.navigate({ name: 'chat', contactId: contact.id })));
    currentDirectory = directory;
    shell.mountScreen(directory.mount());
    return;
  }

  const peer = state.role === 'admin' && state.activeContactId ? getContact(state, state.activeContactId) : support;
  shell.setHeader({
    title: peer.name,
    subtitle: state.role === 'admin' ? (peer.accountType === 'guest' ? 'Vãng lai' : 'Khách hàng') : 'Đang hỗ trợ',
    back: state.role === 'admin',
    call: true,
    menu: true,
    onBack: () => router.navigate({ name: 'directory', contactId: null }),
    onCall: () => calls.startOutgoing(peer),
    onMenu: (anchor) => state.role === 'admin' ? openAdminChatMenu(peer, anchor) : openUserChatMenu(anchor)
  });
  const chat = new ChatScreen(store, overlays, peer, {
    localParticipantId: localParticipantId(),
    conversationSource: conversationSourceFor(peer),
    onCallBack: () => calls.startOutgoing(peer),
    onError: (error) => notifySyncError(error)
  });
  currentChat = chat;
  shell.mountScreen(chat.mount());
}

function setAdminDesktopHeader(peer: Contact): void {
  shell.setHeader({
    title: peer.name,
    subtitle: peer.accountType === 'guest' ? 'Vãng lai' : 'Khách hàng',
    leadingIcon: 'contacts',
    call: true,
    menu: true,
    onCall: () => calls.startOutgoing(peer),
    onMenu: (anchor) => openAdminChatMenu(peer, anchor)
  });
}

function openActiveMedia(): void {
  if (currentWorkspace) currentWorkspace.openMedia();
  else currentChat?.openMedia();
}

function openAdminChatMenu(peer: Contact, anchor: HTMLElement): void {
  const content = document.createElement('div');
  content.className = 'quick-menu';
  const directoryOps = new DirectoryScreen(store, overlays, directoryManagementCallbacks(() => undefined));
  const isGuest = peer.accountType === 'guest';
  content.innerHTML = `
    <button data-media>${icon('image')}<span>Đa phương tiện</span></button>
    ${livePushService ? `<button data-notifications>${icon('bell')}<span>Thông báo</span></button>` : ''}
    ${isGuest ? `<button data-create>${icon('plus')}<span>Tạo</span></button>` : `<button data-edit>${icon('edit')}<span>Sửa</span></button><button data-group>${icon('group')}<span>Nhóm</span></button>`}
    <button class="danger-text" data-delete>${icon('trash')}<span>Xóa</span></button>`;
  const menuId = overlays.openPopover(anchor, content, { width: 210 });

  content.querySelector<HTMLButtonElement>('[data-media]')?.addEventListener('click', () => { overlays.close(menuId); openActiveMedia(); });
  content.querySelector<HTMLButtonElement>('[data-notifications]')?.addEventListener('click', () => { overlays.close(menuId); void enablePushNotifications(); });
  content.querySelector<HTMLButtonElement>('[data-create]')?.addEventListener('click', () => { overlays.close(menuId); directoryOps.openPromote(peer); });
  content.querySelector<HTMLButtonElement>('[data-edit]')?.addEventListener('click', () => { overlays.close(menuId); directoryOps.openEdit(peer); });
  content.querySelector<HTMLButtonElement>('[data-group]')?.addEventListener('click', () => paintGroupChoices(content, peer, menuId));
  content.querySelector<HTMLButtonElement>('[data-delete]')?.addEventListener('click', () => {
    overlays.close(menuId);
    const copy = destructiveConfirmCopy(peer.name);
    overlays.openConfirm({ ...copy, onConfirm: () => {
      if (liveAdminDirectory) {
        void liveAdminDirectory.deleteContact(peer.id)
          .then(() => refreshAdminDirectory())
          .then(() => afterPeerDeleted(peer.id))
          .catch((error) => notifySyncError(error instanceof Error ? error : new Error(String(error))));
        return;
      }
      deleteContact(state, peer.id);
      afterPeerDeleted(peer.id);
    } });
  });
}

function paintGroupChoices(content: HTMLElement, peer: Contact, menuId: string): void {
  if (peer.accountType !== 'customer') return;
  const groups = state.groups.filter((group) => group.id !== 'guest');
  content.innerHTML = `<div class="quick-menu-title"><span>Nhóm</span></div>${groups.map((group) => {
    const selected = group.id === 'customer' ? peer.customerGroupId === null : peer.customerGroupId === group.id;
    return `<button data-group-id="${escapeAttr(group.id)}"><span>${escapeHtml(group.name)}</span><b>${selected ? '✓' : ''}</b></button>`;
  }).join('')}`;
  content.querySelectorAll<HTMLButtonElement>('[data-group-id]').forEach((button) => button.addEventListener('click', () => {
    const groupId = button.dataset.groupId ?? 'customer';
    if (liveAdminDirectory) {
      void liveAdminDirectory.assignGroup(peer.id, groupId === 'customer' ? null : groupId)
        .then(() => refreshAdminDirectory())
        .then(() => overlays.close(menuId))
        .catch((error) => notifySyncError(error instanceof Error ? error : new Error(String(error))));
      return;
    }
    assignCustomerGroup(state, peer.id, groupId);
    overlays.close(menuId);
    if (currentWorkspace) currentWorkspace.select(peer);
  }));
}

function openUserChatMenu(anchor: HTMLElement): void {
  const content = document.createElement('div');
  content.className = 'quick-menu';
  const canEditAccount = !runtimeSession || Boolean(runtimeSession.profile.username);
  content.innerHTML = `<button data-media>${icon('image')}<span>Đa phương tiện</span></button>${livePushService ? `<button data-notifications>${icon('bell')}<span>Thông báo</span></button>` : ''}${canEditAccount ? `<button data-account>${icon('edit')}<span>Tài khoản</span></button>` : ''}`;
  const menuId = overlays.openPopover(anchor, content, { width: 210 });
  content.querySelector<HTMLButtonElement>('[data-media]')?.addEventListener('click', () => { overlays.close(menuId); openActiveMedia(); });
  content.querySelector<HTMLButtonElement>('[data-notifications]')?.addEventListener('click', () => { overlays.close(menuId); void enablePushNotifications(); });
  content.querySelector<HTMLButtonElement>('[data-account]')?.addEventListener('click', () => { overlays.close(menuId); openUserAccount(); });
}


async function enablePushNotifications(): Promise<void> {
  if (!livePushService || !runtimeSession) return;
  try {
    const result = await livePushService.enable(runtimeSession.deviceId);
    if (result === 'subscribed') notifications.notify({ text: 'Đã bật thông báo', detail: 'Tin nhắn và cuộc gọi đến sẽ dùng Web Push.' });
    else if (result === 'denied') notifications.notify({ text: 'Thông báo đang bị chặn', detail: 'Hãy cho phép thông báo trong cài đặt trình duyệt/PWA.' });
    else if (result === 'unsupported') notifications.notify({ text: 'Chưa hỗ trợ Web Push', detail: 'Trên iPhone, hãy mở TAPHOA từ biểu tượng đã thêm vào Màn hình chính.' });
  } catch (error) {
    notifyPushError(error);
  }
}

function notifyPushError(error: unknown): void {
  const normalized = error instanceof Error ? error : new Error(String(error));
  notifications.notify({ text: 'Không bật được thông báo', detail: normalized.message });
}

function bindPushNavigationMessages(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown; payload?: PushNavigationPayload } | null;
    if (!data || data.type !== 'taphoa:notification-click' || !data.payload) return;
    handlePushNavigation(data.payload);
  });
}

function consumePendingPushNavigation(): void {
  if (!pendingPushPayload) return;
  const payload = pendingPushPayload;
  pendingPushPayload = null;
  handlePushNavigation(payload);
}

function handlePushNavigation(payload: PushNavigationPayload): void {
  if (!runtimeSession) {
    pendingPushPayload = payload;
    return;
  }
  const conversationId = notificationConversationId(payload);
  if (!conversationId) return;
  const peerId = [...runtimeSession.conversationIds.entries()].find(([, boundConversationId]) => boundConversationId === conversationId)?.[0];
  if (!peerId) return;
  state.activeContactId = peerId;
  router.navigate({ name: 'chat', contactId: peerId });
  if (notificationCallId(payload) && liveCallService) void liveCallService.start().catch((error) => notifications.notify({ text: 'Cuộc gọi gặp lỗi', detail: error instanceof Error ? error.message : String(error) }));
  clearPushLaunchQuery();
}

function clearPushLaunchQuery(): void {
  const url = new URL(location.href);
  for (const key of ['conversation', 'call', 'notification']) url.searchParams.delete(key);
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function appendCallHistory(peerId: string, message: ChatMessage): void {
  if (currentWorkspace?.chat?.peer.id === peerId) {
    currentWorkspace.chat.appendCallEvent(message);
    return;
  }
  if (currentChat?.peer.id === peerId) {
    currentChat.appendCallEvent(message);
    return;
  }
  const messages = state.messages[peerId] ??= [];
  messages.push(message);
}

function afterPeerDeleted(id: string): void {
  if (state.activeContactId === id) state.activeContactId = null;
  if (state.role === 'admin' && desktopAdmin.matches) mountRoute();
  else router.navigate({ name: 'directory', contactId: null });
}

function openUserAccount(): void {
  const form = document.createElement('form');
  form.className = 'account-form';
  form.innerHTML = `
    <label>Tên<input name="name" value="${escapeAttr(userProfile.name)}" required /></label>
    <label>Tài khoản<input name="username" value="${escapeAttr(userProfile.username)}" required autocomplete="username" /></label>
    <label>Mật khẩu<input name="password" value="${escapeAttr(userProfile.password)}" required autocomplete="new-password" /></label>
    <button class="button" type="submit">Cập nhật</button>`;
  const sheet = overlays.openSheet({ title: 'Tài khoản', content: form });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveUserAccount(form, sheet);
  });
}

async function saveUserAccount(form: HTMLFormElement, sheet: string): Promise<void> {
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit?.disabled) return;
  if (submit) submit.disabled = true;
  const data = new FormData(form);
  const next = {
    name: String(data.get('name') ?? userProfile.name),
    username: String(data.get('username') ?? userProfile.username),
    password: String(data.get('password') ?? userProfile.password)
  };
  try {
    if (liveAuthService && runtimeSession) {
      const updated = await liveAuthService.updateRegisteredAccount(next);
      runtimeSession = { ...runtimeSession, profile: { name: updated.name, username: updated.username } };
      userProfile.name = updated.name;
      userProfile.username = updated.username;
      userProfile.password = '••••••';
    } else {
      userProfile.name = next.name;
      userProfile.username = next.username;
      userProfile.password = next.password;
    }
    overlays.close(sheet);
    notifications.notify({ text: 'Đã cập nhật tài khoản' });
  } catch (error) {
    if (submit) submit.disabled = false;
    notifySyncError(error instanceof Error ? error : new Error(String(error)));
  }
}

function bindEdgeSwipe(): void {
  let sx = 0;
  let sy = 0;
  let active = false;
  appRoot.addEventListener('pointerdown', (event) => {
    if (desktopAdmin.matches || event.clientX > 20 || state.role !== 'admin' || state.route !== 'chat') return;
    sx = event.clientX; sy = event.clientY; active = true;
  });
  appRoot.addEventListener('pointerup', (event) => {
    if (!active) return;
    active = false;
    const dx = event.clientX - sx;
    const dy = event.clientY - sy;
    if (dx > 58 && Math.abs(dy) < 42) router.navigate({ name: 'directory', contactId: null });
  });
}

function resolveRole(): Role {
  const params = new URLSearchParams(location.search);
  return params.get('role') === 'user' || location.hash === '#user' ? 'user' : 'admin';
}

function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char)); }
function escapeAttr(value: string): string { return escapeHtml(value).replace(/`/g, '&#96;'); }

declare global {
  interface Window {
    __taphoa?: {
      notify: (text: string) => void;
      incoming: (contactId?: string) => void;
      role: () => Role;
      media: () => void;
    };
  }
}
window.__taphoa = {
  notify: (text) => notifications.notify({ text }),
  incoming: (contactId) => {
    if (state.role !== 'admin') { calls.startIncoming(support); return; }
    const id = contactId ?? state.contacts[0]?.id;
    if (id) calls.startIncoming(getContact(state, id));
  },
  role: () => state.role,
  media: () => openActiveMedia()
};
