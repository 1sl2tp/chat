import { bootstrapAdminIdentity } from './admin/bootstrap'
import { signInAdmin } from './admin/auth'
import { clearAdminSelection, selectAdminConversation, sendAdminText, startAdminRuntime } from './admin/runtime'
import { logoutAdmin } from './admin/session'
import { getAdminState, subscribeAdminState } from './admin/store'
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
let notificationBusy = false
const recorder = new VoiceRecorderSession()

async function ensureAdminIdentity(): Promise<void> {
  adminIdentity = await bootstrapAdminIdentity(createSupabaseChatBackend(adminSupabase), { deviceKey: getOrCreateDeviceKey(), label: getDeviceLabel(), platform: getDevicePlatform() })
}
function profileId(): string {
  if (!adminIdentity || typeof adminIdentity !== 'object') return ''
  const profile=(adminIdentity as {profile?:unknown}).profile
  return profile && typeof profile==='object' ? String((profile as {id?:unknown}).id??'') : ''
}
function callContext(): VoiceCallContext | null {
  if(!adminIdentity||typeof adminIdentity!=='object') return null
  const identity=adminIdentity as {profile?:unknown;device_id?:unknown}
  const profile=identity.profile&&typeof identity.profile==='object'?identity.profile as {id?:unknown}:null
  const state=getAdminState(); const pid=String(profile?.id??''); const did=String(identity.device_id??'')
  return pid&&did?{profileId:pid,deviceId:did,conversationId:state.selectedConversationId,peerName:state.detail?.displayName?.trim()||'User'}:null
}

const runtimeActions={
  get canSend(){return Boolean(getAdminState().selectedConversationId)&&getChatMessageState().realtime!=='error'},
  get canAttach(){return Boolean(getAdminState().selectedConversationId)&&Boolean(getConversationCapabilities())},
  get canRecord(){return Boolean(getAdminState().selectedConversationId)&&Boolean(getConversationCapabilities())&&typeof MediaRecorder!=='undefined'&&Boolean(navigator.mediaDevices?.getUserMedia)},
  get canCall(){return Boolean(getAdminState().selectedConversationId)&&callSession?.getState().phase==='idle'},
  sendText:sendAdminText,
  async sendAttachment(file:File){const c=getConversationCapabilities();if(!c)throw new Error('attachment_unavailable');await c.sendAttachment(file)},
  async startVoiceRecording(){await recorder.start()},
  async stopVoiceRecording(){const r=await recorder.stop();const c=getConversationCapabilities();if(!c)throw new Error('attachment_unavailable');await c.sendAttachment(r.file)},
  async startCall(){await callSession?.startOutgoing()},
}
const actions=toConversationActionsAdapter(runtimeActions)

function render():void{
  if(!workspace)return
  const state=getAdminState(); const messages=getChatMessageState(); const selected=Boolean(state.selectedConversationId)
  workspace.renderInbox(state.inbox,id=>{void selectAdminConversation(id)})
  if(selected){
    workspace.showChat()
    if(!conversation){
      conversation=mountCleanChatSurface({root:workspace.chatHost,model:toConversationViewModel({actor:'admin',conversationId:state.selectedConversationId,title:state.detail?.displayName?.trim()||'User',subtitle:'Hỗ trợ',canCall:false,messages:[],currentProfileId:profileId()||null}),actions,onBack:()=>{clearAdminSelection();conversation?.destroy();conversation=null;render()},onCall:()=>{void actions.startCall().catch(()=>{})}})
    }
    conversation.update(toConversationViewModel({actor:'admin',conversationId:state.selectedConversationId,title:state.detail?.displayName?.trim()||'User',subtitle:state.phase==='error'?'Không thể kết nối':'Đang hoạt động',canCall:callSession?.getState().phase==='idle',messages:messages.messages,currentProfileId:profileId()||null}))
    conversation.setEnabled(messages.realtime!=='error')
  }else{
    workspace.showInbox(); if(conversation){conversation.destroy();conversation=null}
  }
  if(callPush){const p=notificationButtonPresentation(callPush.getState(),callPush.getIssue(),notificationBusy);workspace.notificationButton.hidden=false;workspace.notificationButton.textContent=p.label;workspace.notificationButton.disabled=p.disabled}else workspace.notificationButton.hidden=true
}

async function mountLogin(message=''):Promise<void>{
  conversation?.destroy();conversation=null;callUi?.destroy();callUi=null;callSession?.dispose();callSession=null;disposeCallPush?.();disposeCallPush=null;callPush=null;workspace=null
  const ui=createCleanAdminLogin(root,message)
  ui.form.addEventListener('submit',async event=>{event.preventDefault();ui.button.disabled=true;ui.error.textContent='';try{await signInAdmin({async signIn(email,password){const r=await adminSupabase.auth.signInWithPassword({email,password});if(r.error)throw r.error}},ui.login.value,ui.password.value);await bootWorkspace()}catch{ui.error.textContent='Không đăng nhập được Hỗ trợ.';ui.button.disabled=false}})
  ui.password.focus()
}

async function bootWorkspace():Promise<void>{
  try{
    await ensureAdminIdentity()
    workspace=createCleanAdminWorkspace(root);workspace.diagnostic.textContent=APP_VERSION
    callSession=new VoiceCallSession(adminSupabase,callContext);callUi=mountCleanCallUi(workspace.callHost,callSession);callSession.subscribe(render);callSession.start()
    const reg=await pwaRegistrationPromise;const did=callContext()?.deviceId
    if(reg&&did){callPush=new CallPushRegistration(adminSupabase,did,callPushBrowserForRegistration(reg));disposeCallPush=callPush.subscribe(render);void callPush.sync()}
    workspace.notificationButton.addEventListener('click',async()=>{if(!callPush||notificationBusy)return;notificationBusy=true;render();try{callSession?.prepareAlertAudioFromUserGesture();if(callPush.getState()==='enabled')await callPush.testFromUserGesture();else await callPush.enableFromUserGesture()}finally{notificationBusy=false;render()}})
    workspace.logoutButton.addEventListener('click',async()=>{workspace!.logoutButton.disabled=true;conversation?.destroy();conversation=null;callUi?.destroy();callUi=null;callSession?.dispose();callSession=null;disposeCallPush?.();disposeCallPush=null;callPush=null;await logoutAdmin({async unsubscribePush(){const r=await pwaRegistrationPromise;if(r)await clearCurrentPushSubscription(pushCleanupBrowserForRegistration(r))},async endAdminSession(){const r=await adminSupabase.rpc('chat_end_admin_session');if(r.error)throw r.error},async signOutAdmin(){const r=await adminSupabase.auth.signOut();if(r.error)throw r.error}});await mountLogin()})
    subscribeAdminState(render);subscribeChatMessages(render)
    await startAdminRuntime()
    const requested=new URL(window.location.href).searchParams.get('conversation');if(requested){await selectAdminConversation(requested);history.replaceState(null,'','./')}
    render()
  }catch{await adminSupabase.auth.signOut();await mountLogin('Phiên Hỗ trợ không hợp lệ.')}
}

async function start():Promise<void>{const r=await adminSupabase.auth.getSession();if(r.error||!r.data.session){await mountLogin();return}await bootWorkspace()}
setupViewportController();installNotificationContextResponder(()=>getAdminState().selectedConversationId||null);void start()
