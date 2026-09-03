import { bootstrapAdminIdentity } from './admin/bootstrap'
import { signInAdmin } from './admin/auth'
import type { AdminSupportDetail } from './admin/contracts'
import { clearAdminSelection, refreshAdminInbox, selectAdminConversation, sendAdminText, startAdminRuntime, stopAdminRuntime } from './admin/runtime'
import { logoutAdmin } from './admin/session'
import { getAdminState, subscribeAdminState } from './admin/store'
import { createUser2WithDisplayNameFromAdmin, deleteUserFromAdmin, resetUser2PasswordFromAdmin, updateUser2FromAdmin, upgradeGuestFromAdmin } from './admin/user2-account'
import { VoiceCallSession, type VoiceCallContext } from './call/voice-session'
import { VoiceRecorderSession } from './chat/attachments/voice-recorder'
import { getChatMessageState, subscribeChatMessages } from './chat/message-runtime'
import { toConversationActionsAdapter, toConversationViewModel } from './chat/ui/chatwoot-adapter'
import { getDeviceLabel, getDevicePlatform, getOrCreateDeviceKey } from './device/identity'
import { CallPushRegistration, callPushBrowserForRegistration } from './notifications/call-push-registration'
import { notificationButtonPresentation } from './notifications/presentation'
import { clearCurrentPushSubscription, pushCleanupBrowserForRegistration } from './notifications/push-cleanup'
import { installNotificationContextResponder } from './notifications/window-context'
import { setupPwa } from './pwa'
import { createSupabaseChatBackend } from './supabase/chat-backend'
import { adminSupabase } from './supabase/client'
import { getConversationCapabilities } from './ui/chat/capabilities'
import { createCleanAdminLogin, createCleanAdminWorkspace, type CleanAdminWorkspace } from './ui/clean/admin/admin-ui'
import { mountCleanCallUi, type MountedCleanCallUi } from './ui/clean/call/call-ui'
import { mountCleanChatSurface, type MountedCleanChatSurface } from './ui/clean/chat/chat-surface'
import { setupViewportController } from './viewport/controller'
import { APP_VERSION } from './version'

const rootElement = document.querySelector<HTMLDivElement>('#app')
if (!rootElement) throw new Error('Missing #app root')
const root: HTMLDivElement = rootElement
const pwaRegistrationPromise = setupPwa('admin')
let adminIdentity: unknown = null
let workspace: CleanAdminWorkspace | null = null
let conversation: MountedCleanChatSurface | null = null
let callSession: VoiceCallSession | null = null
let callUi: MountedCleanCallUi | null = null
let callPush: CallPushRegistration | null = null
let disposeCallPush: (() => void) | null = null
let stopAdminState: (() => void) | null = null
let stopMessages: (() => void) | null = null
let stopCallState: (() => void) | null = null
let notificationBusy = false
const recorder = new VoiceRecorderSession()

async function ensureAdminIdentity(): Promise<void> {
  adminIdentity = await bootstrapAdminIdentity(createSupabaseChatBackend(adminSupabase), { deviceKey: getOrCreateDeviceKey(), label: getDeviceLabel(), platform: getDevicePlatform() })
}
function profileId(): string {
  if (!adminIdentity || typeof adminIdentity !== 'object') return ''
  const profile = (adminIdentity as { profile?: unknown }).profile
  return profile && typeof profile === 'object' ? String((profile as { id?: unknown }).id ?? '') : ''
}
function callContext(): VoiceCallContext | null {
  if (!adminIdentity || typeof adminIdentity !== 'object') return null
  const identity = adminIdentity as { profile?: unknown; device_id?: unknown }
  const profile = identity.profile && typeof identity.profile === 'object' ? identity.profile as { id?: unknown } : null
  const state = getAdminState(); const pid = String(profile?.id ?? ''); const did = String(identity.device_id ?? '')
  return pid && did ? { profileId: pid, deviceId: did, conversationId: state.selectedConversationId, peerName: state.detail?.displayName?.trim() || 'User' } : null
}

const runtimeActions = {
  get canSend() { return Boolean(getAdminState().selectedConversationId) && getChatMessageState().realtime !== 'error' },
  get canAttach() { return Boolean(getAdminState().selectedConversationId) && Boolean(getConversationCapabilities()) },
  get canRecord() { return Boolean(getAdminState().selectedConversationId) && Boolean(getConversationCapabilities()) && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) },
  get canCall() { return Boolean(getAdminState().selectedConversationId) && callSession?.getState().phase === 'idle' },
  sendText: sendAdminText,
  async sendAttachment(file: File) { const c = getConversationCapabilities(); if (!c) throw new Error('attachment_unavailable'); await c.sendAttachment(file) },
  async startVoiceRecording() { await recorder.start() },
  async stopVoiceRecording() { const r = await recorder.stop(); const c = getConversationCapabilities(); if (!c) throw new Error('attachment_unavailable'); await c.sendAttachment(r.file) },
  async startCall() { await callSession?.startOutgoing() },
}
const actions = toConversationActionsAdapter(runtimeActions)

function adminErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/username_taken|username_exists|username_reserved/.test(message)) return 'Tài khoản đã được sử dụng.'
  if (/invalid_username|reserved_username/.test(message)) return 'Tài khoản dùng 3–24 ký tự: a-z, 0-9, _.'
  if (/invalid_display_name/.test(message)) return 'Tên hiển thị chưa hợp lệ.'
  if (/password_mismatch/.test(message)) return 'Mật khẩu nhập lại không khớp.'
  if (/password|invalid_password/.test(message)) return 'Mật khẩu cần ít nhất 6 ký tự.'
  return 'Không thể thực hiện thao tác.'
}
async function invokeAdminAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await adminSupabase.functions.invoke('taphoaxyz-admin-user', { body })
  if (result.error) throw result.error
  return result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : {}
}
async function refreshSelected(conversationId: string | null): Promise<void> {
  await refreshAdminInbox()
  if (conversationId) await selectAdminConversation(conversationId)
}
function field(id: string, placeholder: string, type = 'text', value = ''): string {
  return `<input id="${id}" type="${type}" value="${value.replaceAll('&','&amp;').replaceAll('"','&quot;')}" placeholder="${placeholder}" ${type === 'password' ? 'autocomplete="new-password"' : 'autocomplete="off"'}>`
}
function openCreateUser(): void {
  if (!workspace) return
  workspace.manageTitle.textContent = 'Tạo User 2'
  workspace.manageBody.innerHTML = `<form id="clean-create-user-form" class="clean-admin-manage-form"><h3>Tạo User 2</h3>${field('clean-create-display','Tên hiển thị')}${field('clean-create-username','Tài khoản')}${field('clean-create-password','Mật khẩu','password')}<button type="submit">Tạo User 2</button><p aria-live="polite"></p></form>`
  workspace.setManageOpen(true)
  const form = workspace.manageBody.querySelector<HTMLFormElement>('#clean-create-user-form')!
  const status = form.querySelector<HTMLElement>('p')!
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector<HTMLButtonElement>('button')!; button.disabled = true; status.textContent = 'Đang tạo…'
    try {
      const created = await createUser2WithDisplayNameFromAdmin({ async create(input) { const data = await invokeAdminAction({ action: 'create_user2', ...input }); return { displayName: typeof data.displayName === 'string' ? data.displayName : input.displayName, username: typeof data.username === 'string' ? data.username : input.username } } }, (form.querySelector('#clean-create-display') as HTMLInputElement).value, (form.querySelector('#clean-create-username') as HTMLInputElement).value, (form.querySelector('#clean-create-password') as HTMLInputElement).value)
      status.textContent = `Đã tạo ${created.displayName}.`; await refreshAdminInbox(); button.disabled = false
    } catch (error) { status.textContent = adminErrorMessage(error); button.disabled = false }
  })
}
function openManageUser(detail: AdminSupportDetail): void {
  if (!workspace) return
  workspace.manageTitle.textContent = detail.userLevel === 1 ? 'Nâng lên User 2' : 'Quản lý User 2'
  const display = detail.displayName?.trim() || ''
  const username = detail.username?.trim() || ''
  workspace.manageBody.innerHTML = detail.userLevel === 1
    ? `<form id="clean-upgrade-form" class="clean-admin-manage-form"><h3>Nâng lên User 2</h3>${field('clean-upgrade-display','Tên hiển thị','text',display)}${field('clean-upgrade-username','Tài khoản')}${field('clean-upgrade-password','Mật khẩu','password')}<button type="submit">Nâng lên User 2</button><p aria-live="polite"></p></form><button id="clean-delete-user" class="clean-admin-manage-danger" type="button">Xóa User</button>`
    : `<form id="clean-edit-form" class="clean-admin-manage-form"><h3>Thông tin User 2</h3>${field('clean-edit-display','Tên hiển thị','text',display)}${field('clean-edit-username','Tài khoản','text',username)}<button type="submit">Lưu thay đổi</button><p aria-live="polite"></p></form><form id="clean-reset-form" class="clean-admin-manage-form"><h3>Đặt lại mật khẩu</h3>${field('clean-reset-password','Mật khẩu mới','password')}${field('clean-reset-confirm','Nhập lại mật khẩu','password')}<button type="submit">Đặt lại mật khẩu</button><p aria-live="polite"></p></form><button id="clean-delete-user" class="clean-admin-manage-danger" type="button">Xóa User</button>`
  workspace.setManageOpen(true)
  if (detail.userLevel === 1) {
    const form = workspace.manageBody.querySelector<HTMLFormElement>('#clean-upgrade-form')!; const status = form.querySelector<HTMLElement>('p')!
    form.addEventListener('submit', async event => { event.preventDefault(); try { await upgradeGuestFromAdmin({ async upgrade(input) { const data = await invokeAdminAction({ action: 'upgrade_guest', ...input }); return { username: typeof data.username === 'string' ? data.username : input.username } } }, detail.profileId, (form.querySelector('#clean-upgrade-display') as HTMLInputElement).value, (form.querySelector('#clean-upgrade-username') as HTMLInputElement).value, (form.querySelector('#clean-upgrade-password') as HTMLInputElement).value); status.textContent = 'Đã nâng lên User 2.'; await refreshSelected(detail.conversationId) } catch (error) { status.textContent = adminErrorMessage(error) } })
  } else {
    const edit = workspace.manageBody.querySelector<HTMLFormElement>('#clean-edit-form')!; const editStatus = edit.querySelector<HTMLElement>('p')!
    edit.addEventListener('submit', async event => { event.preventDefault(); try { await updateUser2FromAdmin({ async update(input) { const data = await invokeAdminAction({ action: 'update_user2', ...input }); return { username: typeof data.username === 'string' ? data.username : input.username } } }, detail.profileId, (edit.querySelector('#clean-edit-display') as HTMLInputElement).value, (edit.querySelector('#clean-edit-username') as HTMLInputElement).value); editStatus.textContent = 'Đã lưu.'; await refreshSelected(detail.conversationId) } catch (error) { editStatus.textContent = adminErrorMessage(error) } })
    const reset = workspace.manageBody.querySelector<HTMLFormElement>('#clean-reset-form')!; const resetStatus = reset.querySelector<HTMLElement>('p')!
    reset.addEventListener('submit', async event => { event.preventDefault(); try { await resetUser2PasswordFromAdmin({ async resetPassword(input) { await invokeAdminAction({ action: 'reset_password', ...input }) } }, detail.profileId, (reset.querySelector('#clean-reset-password') as HTMLInputElement).value, (reset.querySelector('#clean-reset-confirm') as HTMLInputElement).value); resetStatus.textContent = 'Đã đặt lại mật khẩu.' } catch (error) { resetStatus.textContent = adminErrorMessage(error) } })
  }
  workspace.manageBody.querySelector<HTMLButtonElement>('#clean-delete-user')!.addEventListener('click', async () => { if (!window.confirm(`Xóa ${display || 'User'}? Lịch sử chat vẫn được giữ lại.`)) return; try { await deleteUserFromAdmin({ async deleteUser(profileId) { await invokeAdminAction({ action: 'delete_user', profileId }) } }, detail.profileId); workspace?.setManageOpen(false); clearAdminSelection(); await refreshAdminInbox() } catch (error) { window.alert(adminErrorMessage(error)) } })
}

function render(): void {
  if (!workspace) return
  const state = getAdminState(); const messages = getChatMessageState(); const selected = Boolean(state.selectedConversationId)
  workspace.renderInbox(state.inbox, id => { void selectAdminConversation(id) })
  if (selected) {
    workspace.showChat()
    if (!conversation) conversation = mountCleanChatSurface({ root: workspace.chatHost, model: toConversationViewModel({ actor: 'admin', conversationId: state.selectedConversationId, title: state.detail?.displayName?.trim() || 'User', subtitle: 'Hỗ trợ', canCall: false, messages: [], currentProfileId: profileId() || null }), actions, onBack: () => { clearAdminSelection(); conversation?.destroy(); conversation = null; render() }, onCall: () => { void actions.startCall().catch(() => {}) }, onMenu: () => { const detail = getAdminState().detail; if (detail) openManageUser(detail) } })
    conversation.update(toConversationViewModel({ actor: 'admin', conversationId: state.selectedConversationId, title: state.detail?.displayName?.trim() || 'User', subtitle: state.phase === 'error' ? 'Không thể kết nối' : 'Đang hoạt động', canCall: callSession?.getState().phase === 'idle', messages: messages.messages, currentProfileId: profileId() || null }))
    conversation.setEnabled(messages.realtime !== 'error')
  } else { workspace.showInbox(); if (conversation) { conversation.destroy(); conversation = null } }
  if (callPush) { const p = notificationButtonPresentation(callPush.getState(), callPush.getIssue(), notificationBusy); workspace.notificationButton.hidden = false; workspace.notificationButton.textContent = p.label; workspace.notificationButton.disabled = p.disabled } else workspace.notificationButton.hidden = true
}

function cleanupWorkspace(): void {
  stopAdminState?.(); stopAdminState = null
  stopMessages?.(); stopMessages = null
  stopCallState?.(); stopCallState = null
  stopAdminRuntime()
  conversation?.destroy(); conversation = null
  callUi?.destroy(); callUi = null
  callSession?.dispose(); callSession = null
  disposeCallPush?.(); disposeCallPush = null; callPush = null
  workspace = null
}
async function mountLogin(message = ''): Promise<void> {
  cleanupWorkspace()
  const ui = createCleanAdminLogin(root, message)
  ui.form.addEventListener('submit', async event => { event.preventDefault(); ui.button.disabled = true; ui.error.textContent = ''; try { await signInAdmin({ async signIn(email, password) { const r = await adminSupabase.auth.signInWithPassword({ email, password }); if (r.error) throw r.error } }, ui.login.value, ui.password.value); await bootWorkspace() } catch { ui.error.textContent = 'Không đăng nhập được Hỗ trợ.'; ui.button.disabled = false } })
  ui.password.focus()
}
async function bootWorkspace(): Promise<void> {
  try {
    cleanupWorkspace(); await ensureAdminIdentity(); workspace = createCleanAdminWorkspace(root); workspace.diagnostic.textContent = APP_VERSION; workspace.createUserButton.addEventListener('click', openCreateUser)
    callSession = new VoiceCallSession(adminSupabase, callContext); callUi = mountCleanCallUi(workspace.callHost, callSession); stopCallState = callSession.subscribe(render); callSession.start()
    const reg = await pwaRegistrationPromise; const did = callContext()?.deviceId
    if (reg && did) { callPush = new CallPushRegistration(adminSupabase, did, callPushBrowserForRegistration(reg)); disposeCallPush = callPush.subscribe(render); void callPush.sync() }
    workspace.notificationButton.addEventListener('click', async () => { if (!callPush || notificationBusy) return; notificationBusy = true; render(); try { callSession?.prepareAlertAudioFromUserGesture(); if (callPush.getState() === 'enabled') await callPush.testFromUserGesture(); else await callPush.enableFromUserGesture() } finally { notificationBusy = false; render() } })
    workspace.logoutButton.addEventListener('click', async () => { workspace!.logoutButton.disabled = true; cleanupWorkspace(); await logoutAdmin({ async unsubscribePush() { const r = await pwaRegistrationPromise; if (r) await clearCurrentPushSubscription(pushCleanupBrowserForRegistration(r)) }, async endAdminSession() { const r = await adminSupabase.rpc('chat_end_admin_session'); if (r.error) throw r.error }, async signOutAdmin() { const r = await adminSupabase.auth.signOut(); if (r.error) throw r.error } }); await mountLogin() })
    stopAdminState = subscribeAdminState(render); stopMessages = subscribeChatMessages(render)
    await startAdminRuntime()
    const requested = new URL(window.location.href).searchParams.get('conversation'); if (requested) { await selectAdminConversation(requested); history.replaceState(null, '', './') }
    render()
  } catch { await adminSupabase.auth.signOut(); await mountLogin('Phiên Hỗ trợ không hợp lệ.') }
}
async function start(): Promise<void> { const r = await adminSupabase.auth.getSession(); if (r.error || !r.data.session) { await mountLogin(); return } await bootWorkspace() }
setupViewportController(); installNotificationContextResponder(() => getAdminState().selectedConversationId || null); void start()
