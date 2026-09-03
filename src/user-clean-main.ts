import { VoiceCallSession, type VoiceCallContext } from './call/voice-session'
import { VoiceRecorderSession } from './chat/attachments/voice-recorder'
import { getChatMessageState, subscribeChatMessages } from './chat/message-runtime'
import { sendSupportText, startChatRuntime, stopChatRuntime } from './chat/runtime'
import { getChatRuntimeState, subscribeChatRuntime } from './chat/store'
import { toConversationActionsAdapter, toConversationViewModel } from './chat/ui/chatwoot-adapter'
import { getOrCreateDeviceKey } from './device/identity'
import { CallPushRegistration, callPushBrowserForRegistration } from './notifications/call-push-registration'
import { DEFAULT_NOTIFICATION_PREFERENCES, createCacheNotificationPreferencesStorage, loadNotificationPreferences, notificationDeliveryOptions, saveNotificationPreferences, type NotificationPreferences, type NotificationPreferencesStorage } from './notifications/preferences'
import { clearCurrentPushSubscription, pushCleanupBrowserForRegistration } from './notifications/push-cleanup'
import { notificationButtonPresentation } from './notifications/presentation'
import { installNotificationContextResponder } from './notifications/window-context'
import { setupPwa } from './pwa'
import { guestSupabase, userSupabase } from './supabase/client'
import { changeUser2Password, loginUser2, logoutUser2 } from './user/auth'
import { clearGuestLocalState, endGuestSession as teardownGuestSession } from './user/guest-lifecycle'
import { enterFreshGuest, resolveRootMode, type RootUserMode } from './user/root-session'
import { getConversationCapabilities } from './ui/chat/capabilities'
import { mountCleanCallUi, type MountedCleanCallUi } from './ui/clean/call/call-ui'
import { mountCleanChatSurface, type MountedCleanChatSurface } from './ui/clean/chat/chat-surface'
import { createCleanUserUi } from './ui/clean/user/user-ui'
import { setupViewportController } from './viewport/controller'
import { APP_VERSION } from './version'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('Missing #app root')
const ui = createCleanUserUi(root)
ui.diagnostic.textContent = APP_VERSION
const pwaRegistrationPromise = setupPwa('user')
const recorder = new VoiceRecorderSession()

let mode: RootUserMode = 'guest'
let chat: MountedCleanChatSurface | null = null
let callSession: VoiceCallSession | null = null
let callUi: MountedCleanCallUi | null = null
let callPush: CallPushRegistration | null = null
let disposeCallPush: (() => void) | null = null
let preferences: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES }
let preferenceStorage: NotificationPreferencesStorage | null = null
let busy = false

function currentProfileId(): string {
  const identity = getChatRuntimeState().identity
  if (!identity || typeof identity !== 'object') return ''
  const profile = (identity as { profile?: unknown }).profile
  if (!profile || typeof profile !== 'object') return ''
  return String((profile as { id?: unknown }).id ?? '')
}

function currentCallContext(): VoiceCallContext | null {
  if (mode !== 'user2') return null
  const runtime = getChatRuntimeState()
  if (runtime.phase !== 'ready' || !runtime.identity || typeof runtime.identity !== 'object') return null
  const identity = runtime.identity as { profile?: unknown; device_id?: unknown }
  const profile = identity.profile && typeof identity.profile === 'object' ? identity.profile as { id?: unknown } : null
  const support = runtime.supportEntry && typeof runtime.supportEntry === 'object' ? runtime.supportEntry as { conversation_id?: unknown } : null
  const profileId = String(profile?.id ?? '')
  const deviceId = String(identity.device_id ?? '')
  const conversationId = String(support?.conversation_id ?? '')
  return profileId && deviceId && conversationId ? { profileId, deviceId, conversationId, peerName: 'Hỗ trợ' } : null
}

const runtimeActions = {
  get canSend() { const s = getChatMessageState(); return getChatRuntimeState().phase === 'ready' && s.realtime !== 'error' && Boolean(s.conversationId) },
  get canAttach() { return Boolean(getConversationCapabilities()) },
  get canRecord() { return Boolean(getConversationCapabilities()) && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) },
  get canCall() { return mode === 'user2' && Boolean(currentCallContext()) && callSession?.getState().phase === 'idle' },
  sendText: sendSupportText,
  async sendAttachment(file: File) { const c = getConversationCapabilities(); if (!c) throw new Error('attachment_unavailable'); await c.sendAttachment(file) },
  async startVoiceRecording() { await recorder.start() },
  async stopVoiceRecording() { const result = await recorder.stop(); const c = getConversationCapabilities(); if (!c) throw new Error('attachment_unavailable'); await c.sendAttachment(result.file) },
  async startCall() { await callSession?.startOutgoing() },
}
const actions = toConversationActionsAdapter(runtimeActions)

function ensureChat(): MountedCleanChatSurface {
  if (chat) return chat
  chat = mountCleanChatSurface({
    root: ui.chatHost,
    model: toConversationViewModel({ actor: 'user1', conversationId: null, title: 'Hỗ trợ', subtitle: 'Đang kết nối…', canCall: false, messages: [], currentProfileId: null }),
    actions,
    enabled: false,
    onCall: () => { void actions.startCall().catch(() => {}) },
    onMenu: () => ui.setSheetOpen(true),
  })
  return chat
}

function render(): void {
  const runtime = getChatRuntimeState()
  const messages = getChatMessageState()
  const canSend = runtime.phase === 'ready' && messages.realtime !== 'error' && Boolean(messages.conversationId)
  const canCall = mode === 'user2' && Boolean(currentCallContext()) && callSession?.getState().phase === 'idle'
  const subtitle = runtime.phase === 'error' ? 'Không thể kết nối' : messages.realtime === 'subscribed' ? 'Đang hoạt động' : 'Đang kết nối…'
  ensureChat().update(toConversationViewModel({ actor: mode === 'user2' ? 'user2' : 'user1', conversationId: messages.conversationId, title: 'Hỗ trợ', subtitle, canCall, messages: messages.messages, currentProfileId: currentProfileId() || null }))
  ensureChat().setEnabled(canSend)
  ui.modeLabel.textContent = mode === 'user2' ? 'User 2' : 'User 1 · Vãng lai'
  ui.authAction.textContent = mode === 'user2' ? 'Đăng xuất' : 'Đăng nhập'
  ui.authAction.disabled = busy
  ui.settingsPanel.hidden = mode !== 'user2'
  if (mode === 'user2') {
    ui.notificationChat.checked = preferences.chat
    ui.notificationCall.checked = preferences.call
    ui.notificationSound.value = preferences.sound
    ui.notificationVibrate.checked = preferences.vibrate
  }
  if (callPush) {
    const p = notificationButtonPresentation(callPush.getState(), callPush.getIssue(), busy)
    ui.notificationAction.hidden = false
    ui.notificationAction.textContent = p.label
    ui.notificationAction.disabled = p.disabled
  } else ui.notificationAction.hidden = true
}

async function setupPreferences(): Promise<void> {
  if (preferenceStorage) return
  const reg = await pwaRegistrationPromise
  if (!reg) return
  preferenceStorage = createCacheNotificationPreferencesStorage(reg.scope)
  preferences = await loadNotificationPreferences(preferenceStorage)
}

async function savePreferences(next: NotificationPreferences): Promise<void> {
  if (!preferenceStorage || busy || mode !== 'user2') return
  busy = true; ui.settingsStatus.textContent = 'Đang lưu…'; render()
  try { preferences = next; await saveNotificationPreferences(preferenceStorage, next); ui.settingsStatus.textContent = 'Đã lưu' }
  catch { ui.settingsStatus.textContent = 'Không thể lưu' }
  finally { busy = false; render() }
}

function stopUser2Extras(): void {
  disposeCallPush?.(); disposeCallPush = null; callPush = null
  callUi?.destroy(); callUi = null
  callSession?.dispose(); callSession = null
  ui.callHost.replaceChildren()
}

async function startUser2Extras(): Promise<void> {
  if (mode !== 'user2') return
  if (!callSession) {
    callSession = new VoiceCallSession(userSupabase, currentCallContext)
    callUi = mountCleanCallUi(ui.callHost, callSession)
    callSession.subscribe(render)
    callSession.start()
  }
  await setupPreferences()
  const reg = await pwaRegistrationPromise
  const deviceId = currentCallContext()?.deviceId
  if (reg && deviceId && !callPush) {
    callPush = new CallPushRegistration(userSupabase, deviceId, callPushBrowserForRegistration(reg))
    disposeCallPush = callPush.subscribe(render)
    void callPush.sync()
  }
}

async function endGuestSession(): Promise<void> {
  stopChatRuntime()
  await teardownGuestSession({
    async endRemoteGuest() { const r = await guestSupabase.rpc('chat_end_guest_session'); if (r.error) throw r.error },
    async signOutGuest() { const r = await guestSupabase.auth.signOut(); if (r.error) throw r.error },
  })
}

async function startGuest(): Promise<void> {
  mode = 'guest'
  stopUser2Extras()
  const registration = await pwaRegistrationPromise
  if (registration) {
    await clearCurrentPushSubscription(pushCleanupBrowserForRegistration(registration))
  }
  await startChatRuntime({ client: guestSupabase, deviceKey: getOrCreateDeviceKey('guest') })
  render()
}

async function startUser2(): Promise<void> {
  mode = 'user2'
  await startChatRuntime({ client: userSupabase, deviceKey: getOrCreateDeviceKey('user2') })
  await startUser2Extras()
  render()
}

async function boot(): Promise<void> {
  const resolved = await resolveRootMode({
    async getUser2Session() { const r = await userSupabase.auth.getSession(); if (r.error) throw r.error; const u = r.data.session?.user; return u ? { isAnonymous: Boolean(u.is_anonymous) } : null },
    async clearUser2Session() { const r = await userSupabase.auth.signOut(); if (r.error) throw r.error },
  })
  if (resolved === 'user2') return startUser2()
  await enterFreshGuest({ endGuest: endGuestSession, startGuest })
}

ui.sheetBackdrop.addEventListener('click', () => ui.setSheetOpen(false))
ui.sheetClose.addEventListener('click', () => ui.setSheetOpen(false))
ui.authAction.addEventListener('click', async () => {
  ui.setSheetOpen(false)
  if (mode === 'guest') { ui.setLoginOpen(true); ui.username.focus(); return }
  if (busy) return
  busy = true; render()
  try {
    stopUser2Extras(); stopChatRuntime()
    await logoutUser2({
      async endUser2Session() { const r = await userSupabase.rpc('chat_end_user_session'); if (r.error) throw r.error },
      async signOutUser2() { const r = await userSupabase.auth.signOut(); if (r.error) throw r.error },
    })
    clearGuestLocalState(); window.location.reload()
  } catch { busy = false; render() }
})
ui.loginCancel.addEventListener('click', () => { ui.setLoginOpen(false); ui.loginError.textContent = '' })
ui.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault(); if (busy) return; busy = true; ui.loginSubmit.disabled = true; ui.loginError.textContent = ''
  try {
    await loginUser2({ endGuestSession, async signInUser2(email, password) { const r = await userSupabase.auth.signInWithPassword({ email, password }); if (r.error) throw r.error } }, ui.username.value, ui.password.value)
    window.location.reload()
  } catch { busy = false; ui.loginSubmit.disabled = false; ui.password.value = ''; ui.loginError.textContent = 'Tài khoản hoặc mật khẩu không đúng.'; await startGuest() }
})
ui.notificationChat.addEventListener('change', () => { void savePreferences({ ...preferences, chat: ui.notificationChat.checked }) })
ui.notificationCall.addEventListener('change', () => { void savePreferences({ ...preferences, call: ui.notificationCall.checked }) })
ui.notificationSound.addEventListener('change', () => { void savePreferences({ ...preferences, sound: ui.notificationSound.value === 'silent' ? 'silent' : 'system' }) })
ui.notificationVibrate.addEventListener('change', () => { void savePreferences({ ...preferences, vibrate: ui.notificationVibrate.checked }) })
ui.notificationAction.addEventListener('click', async () => {
  if (!callPush || busy) return
  busy = true; render()
  try { if (callPush.getState() === 'enabled') await callPush.testFromUserGesture(notificationDeliveryOptions('incoming_call', preferences)); else await callPush.enableFromUserGesture() }
  finally { busy = false; render() }
})
ui.passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault(); if (mode !== 'user2' || busy) return; busy = true; render()
  try { await changeUser2Password({ async updatePassword(password) { const r = await userSupabase.auth.updateUser({ password }); if (r.error) throw r.error } }, ui.newPassword.value, ui.confirmPassword.value); ui.settingsStatus.textContent = 'Đã đổi mật khẩu'; ui.newPassword.value = ''; ui.confirmPassword.value = '' }
  catch { ui.settingsStatus.textContent = 'Không thể đổi mật khẩu' }
  finally { busy = false; render() }
})

subscribeChatRuntime(() => { if (mode === 'user2') void startUser2Extras(); render() })
subscribeChatMessages(render)
setupViewportController()
installNotificationContextResponder(() => getChatMessageState().conversationId || null)
ensureChat(); render()
void boot().catch((error) => { console.error('Could not start clean user app', error); render() })
