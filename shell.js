
(()=>{
'use strict';

const ROUTES=Object.freeze(['chat','work']);
const screenHost=document.getElementById('screenHost');
const activeScreenSlot=document.getElementById('activeScreenSlot');
const chatScreen=document.getElementById('chatScreen');
const shellNavigationLayer=document.getElementById('shellNavigationLayer');
const globalOverlayRoot=document.getElementById('globalOverlayRoot');
const sessionHost=document.getElementById('sessionHost');
const appShell=document.getElementById('appShell');

const DESKTOP_DIRECTORY_QUERY='(min-width: 68rem) and (hover: hover) and (pointer: fine)';
const desktopDirectoryMedia=window.matchMedia(DESKTOP_DIRECTORY_QUERY);

let route='chat';
let authState='BOOTING';
let authAccount=null;
let sidebarOpen=false;
let desktopSidebarPersistent=false;
let callState='IDLE';
let callRole='NONE';
let activeContact=null;
let callStartedAt=0;
let callTimerId=0;
let callPendingAction=null;
let callTerminalNotice=null;
let callTerminalNoticeTimer=0;
let unreadCount=0;

function interactionController(){
  return window.V21InteractionController||null;
}

function interactionMode(name){
  return window.V21InteractionMode?.[name]||name;
}

function exitCallInteraction(){
  const controller=interactionController();
  const snapshot=controller?.snapshot?.()||{};
  if(snapshot.owner!=='call-session')return false;
  const allowed=new Set([
    interactionMode('CALL_RINGING'),
    interactionMode('CALL_CONNECTING'),
    interactionMode('AUDIO_CALL'),
    interactionMode('VIDEO_CALL')
  ]);
  if(!allowed.has(snapshot.mode))return false;
  return Boolean(controller.exit(snapshot.mode,{owner:'call-session'}));
}

const SCREEN_SESSION_PREFIX='taphoa.v21.screenSession.';

function screenSessionKey(accountId=authAccount?.id){
  return accountId?`${SCREEN_SESSION_PREFIX}${String(accountId)}`:null;
}

function persistScreenSession(){
  if(authState!=='AUTHENTICATED'||!authAccount?.id)return false;
  const key=screenSessionKey();
  if(!key)return false;
  const payload={
    route:ROUTES.includes(route)?route:'chat',
    activeContact:activeContact?.id?{id:String(activeContact.id),name:String(activeContact.name||'Liên hệ')}:null
  };
  try{sessionStorage.setItem(key,JSON.stringify(payload));return true;}catch{return false;}
}

function readScreenSession(accountId){
  const key=screenSessionKey(accountId);
  if(!key)return null;
  try{
    const raw=sessionStorage.getItem(key);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    return parsed&&typeof parsed==='object'?parsed:null;
  }catch{return null;}
}

function applyRoutePresentation(){
  screenHost.dataset.route=route;
  appShell.dataset.route=route;
  const chatNodes=document.querySelectorAll('[data-chat-thread-node]');
  const workView=document.getElementById('workThreadView');
  for(const node of chatNodes)node.hidden=route!=='chat';
  if(workView)workView.hidden=route!=='work';
  renderTopTabs();
  renderCallFocus();
}

const ScreenSession={
  persist(){return persistScreenSession();},
  restore(account){
    const accountId=account?.id||null;
    const saved=readScreenSession(accountId);
    route=ROUTES.includes(saved?.route)?saved.route:'chat';
    const contact=saved?.activeContact;
    activeContact=contact?.id?{id:String(contact.id),name:String(contact.name||'Liên hệ')}:null;
    sidebarOpen=false;
    syncDesktopSidebarMode();
    syncSidebarPresentation();
    applyRoutePresentation();
    return{route,activeContact:activeContact?{...activeContact}:null};
  },
  clear(accountId=authAccount?.id){
    const key=screenSessionKey(accountId);
    if(!key)return false;
    try{sessionStorage.removeItem(key);return true;}catch{return false;}
  },
  snapshot(){return{route,activeContact:activeContact?{...activeContact}:null};}
};

function renderMenuUnread(){
  const count=Math.max(0,Number(unreadCount)||0);
  const hasUnread=count>0;
  for(const button of document.querySelectorAll('[data-shell-command="sidebar.open"]')){
    button.dataset.hasUnread=String(hasUnread);
    const dot=button.querySelector('[data-menu-unread-dot]');
    if(dot)dot.hidden=!hasUnread;
    button.setAttribute('aria-label',hasUnread?`Mở menu, ${count} tin mới`:'Mở menu');
  }
}

const UnreadIndicator={
  set(count){
    unreadCount=Math.max(0,Number(count)||0);
    renderMenuUnread();
    return unreadCount;
  },
  increment(delta=1){return this.set(unreadCount+Math.max(0,Number(delta)||0));},
  clear(){return this.set(0);},
  snapshot(){return unreadCount;}
};

function syncSidebarPresentation(){
  shellNavigationLayer.dataset.open=String(sidebarOpen);
  shellNavigationLayer.dataset.persistent=String(desktopSidebarPersistent);
  const visible=sidebarOpen||desktopSidebarPersistent;
  shellNavigationLayer.setAttribute('aria-hidden',String(!visible));
  for(const button of document.querySelectorAll('[data-shell-command="sidebar.open"]')){
    button.setAttribute('aria-expanded',String(visible));
  }
  return visible;
}

function syncDesktopSidebarMode(){
  const next=authState==='AUTHENTICATED'&&desktopDirectoryMedia.matches;
  const changed=next!==desktopSidebarPersistent;
  desktopSidebarPersistent=next;
  appShell.dataset.desktopSidebarPersistent=String(desktopSidebarPersistent);
  if(desktopSidebarPersistent)sidebarOpen=false;
  syncSidebarPresentation();
  if(desktopSidebarPersistent&&changed){
    void window.V21ContactStore?.refresh?.();
  }
  return desktopSidebarPersistent;
}

if(typeof desktopDirectoryMedia.addEventListener==='function'){
  desktopDirectoryMedia.addEventListener('change',syncDesktopSidebarMode);
}else if(typeof desktopDirectoryMedia.addListener==='function'){
  desktopDirectoryMedia.addListener(syncDesktopSidebarMode);
}

function setSidebar(open){
  if(desktopSidebarPersistent){
    sidebarOpen=false;
    syncSidebarPresentation();
    if(authState==='AUTHENTICATED')void window.V21ContactStore?.refresh?.();
    return false;
  }
  sidebarOpen=Boolean(open);
  syncSidebarPresentation();
  if(sidebarOpen&&authState==='AUTHENTICATED'){
    void window.V21ContactStore?.refresh?.();
  }
  return sidebarOpen;
}

function renderTopTabs(){
  for(const tab of document.querySelectorAll('[data-top-tab]')){
    tab.setAttribute('aria-selected',String(tab.dataset.topTab===route));
  }
}

const NavigationCommand={
  open(nextRoute){
    if(!ROUTES.includes(nextRoute))return false;
    route=nextRoute;
    setSidebar(false);
    applyRoutePresentation();
    persistScreenSession();
    document.dispatchEvent(new CustomEvent('navigation-change',{detail:{route}}));
    return true;
  },
  openChat(){return this.open('chat')},
  openWork(){return this.open('work')}
};

function formatCallElapsed(totalSeconds){
  const seconds=Math.max(0,Number(totalSeconds)||0);
  const mm=Math.floor(seconds/60).toString().padStart(2,'0');
  const ss=Math.floor(seconds%60).toString().padStart(2,'0');
  return `${mm}:${ss}`;
}

function callPhase(){
  if(callState==='OUTGOING_RINGING'||callState==='INCOMING_RINGING')return 'RINGING';
  if(callState==='CONNECTING_AUDIO')return 'CONNECTING';
  if(callState==='ACTIVE_AUDIO')return 'ACTIVE';
  return 'IDLE';
}

function stopCallTimer(){
  if(callTimerId){
    clearInterval(callTimerId);
    callTimerId=0;
  }
  callStartedAt=0;
}

function currentElapsed(){
  if(!callStartedAt)return '00:00';
  return formatCallElapsed(Math.floor((Date.now()-callStartedAt)/1000));
}

function updateCallTimer(){
  if(callState!=='ACTIVE_AUDIO')return;
  renderCallFocus();
}

function startCallTimer(startedAt=null){
  stopCallTimer();
  const parsed=startedAt?Date.parse(startedAt):NaN;
  callStartedAt=Number.isFinite(parsed)?parsed:Date.now();
  callTimerId=window.setInterval(updateCallTimer,1000);
}

function clearCallTerminalNotice({render=false}={}){
  if(callTerminalNoticeTimer){
    clearTimeout(callTerminalNoticeTimer);
    callTerminalNoticeTimer=0;
  }
  callTerminalNotice=null;
  if(render)renderCallFocus();
}

function terminalNoticeFromCall(call,reason='call-ended'){
  const status=String(call?.status||'').toUpperCase();
  const me=String(authAccount?.id||'');
  const endedBy=String(call?.endedBy||call?.ended_by||'');
  const direction=String(call?.direction||'').toLowerCase();
  const localActor=Boolean(me&&endedBy&&me===endedBy);
  if(status==='ENDED')return{state:'ended',title:localActor?'Đã kết thúc':'Cuộc gọi đã kết thúc'};
  if(status==='REJECTED')return{state:'rejected',title:localActor?'Đã từ chối':'Bên kia đã từ chối'};
  if(status==='CANCELLED')return{state:'cancelled',title:localActor?'Đã hủy':'Cuộc gọi đã hủy'};
  if(status==='MISSED')return{state:'missed',title:direction==='outgoing'?'Không trả lời':'Cuộc gọi nhỡ'};
  return{state:'ended',title:String(reason||'Đã kết thúc')};
}

function terminalNoticeFromReason(reason='call-ended'){
  const map={
    'hangup':{state:'ended',title:'Đã kết thúc'},
    'peer-left':{state:'ended',title:'Cuộc gọi đã kết thúc'},
    'network-offline':{state:'ended',title:'Đã kết thúc'},
    'media-disconnected':{state:'ended',title:'Đã kết thúc'},
    'media-session-lost':{state:'ended',title:'Đã kết thúc'},
    'media-join-failed':{state:'ended',title:'Không thể kết nối'}
  };
  return map[String(reason||'')]||{state:'ended',title:'Đã kết thúc'};
}

function showCallTerminalNotice(call,reason='call-ended'){
  clearCallTerminalNotice();
  callTerminalNotice=call?.status?terminalNoticeFromCall(call,reason):terminalNoticeFromReason(reason);
  callTerminalNoticeTimer=window.setTimeout(()=>{
    callTerminalNoticeTimer=0;
    callTerminalNotice=null;
    renderCallFocus();
  },2200);
}

function callFocusPresentation(){
  const engineSnapshot=window.V21CallEngine?.snapshot?.()||{};
  const callBusy=Boolean(engineSnapshot.busy);

  if(callState==='ACTIVE_AUDIO'){
    return{
      state:'active',title:'Đang nghe',subtitle:'',timer:currentElapsed(),
      action:'end',actionLabel:'Kết thúc',tone:'danger',disabled:callBusy,
      secondary:null,aria:'Kết thúc cuộc gọi'
    };
  }

  if(callState==='CONNECTING_AUDIO'){
    return{
      state:'connecting',title:'Đang kết nối...',subtitle:'',timer:'',
      action:'end',actionLabel:'Kết thúc',tone:'danger',disabled:callBusy,
      secondary:null,aria:'Kết thúc cuộc gọi đang kết nối'
    };
  }

  if(callState==='INCOMING_RINGING'){
    return{
      state:'incoming',title:'Cuộc gọi đến',subtitle:'Nhấn Nghe để trả lời',timer:'',
      action:'accept',actionLabel:'Nghe',tone:'primary',disabled:callBusy,
      secondary:'reject',secondaryLabel:'Từ chối',aria:`Nghe cuộc gọi từ ${activeContact?.name||'liên hệ'}`
    };
  }

  if(callState==='OUTGOING_RINGING'){
    return{
      state:'calling',title:'Đang gọi...',subtitle:'',timer:'',
      action:'cancel',actionLabel:'Hủy',tone:'danger',disabled:callBusy,
      secondary:null,aria:'Hủy cuộc gọi đang gọi'
    };
  }

  if(callTerminalNotice){
    return{
      state:callTerminalNotice.state,title:callTerminalNotice.title,subtitle:'',timer:'',
      action:'icon',actionLabel:'',tone:'primary',disabled:callBusy,
      secondary:null,aria:activeContact?.id?`Gọi ${activeContact.name}`:'Gọi'
    };
  }

  return{
    state:'idle',title:'',subtitle:'',timer:'',
    action:'icon',actionLabel:'',tone:'primary',disabled:callBusy,
    secondary:null,aria:activeContact?.id?`Gọi ${activeContact.name}`:(authState==='AUTHENTICATED'?'Chưa có liên hệ để gọi':'Gọi')
  };
}

function renderCallFocus(){
  const hasContact=Boolean(activeContact?.id);
  const presentation=callFocusPresentation();
  for(const slot of document.querySelectorAll('[data-call-focus-slot]')){
    const chip=slot.querySelector('[data-call-status-chip]');
    const title=slot.querySelector('[data-call-status-title]');
    const subtitle=slot.querySelector('[data-call-status-subtitle]');
    const timer=slot.querySelector('[data-call-status-timer]');
    const secondary=slot.querySelector('[data-call-secondary-button]');
    slot.dataset.callUiState=presentation.state;
    if(chip){
      chip.hidden=presentation.state==='idle';
      chip.dataset.state=presentation.state;
    }
    if(title)title.textContent=presentation.title;
    if(subtitle){
      subtitle.textContent=presentation.subtitle;
      subtitle.hidden=!presentation.subtitle;
    }
    if(timer){
      timer.textContent=presentation.timer;
      timer.hidden=!presentation.timer;
    }
    if(secondary){
      const show=presentation.secondary==='reject';
      const secondaryLabel=secondary.querySelector('.call-secondary-label');
      secondary.hidden=!show;
      secondary.disabled=Boolean(presentation.disabled);
      if(secondaryLabel)secondaryLabel.textContent=presentation.secondaryLabel||'Từ chối';
    }
  }

  for(const button of document.querySelectorAll('[data-call-focus-button]')){
    const label=button.querySelector('.call-focus-label');
    button.dataset.callLive=String(callState!=='IDLE');
    button.dataset.display=presentation.action;
    button.dataset.tone=presentation.tone;
    button.disabled=presentation.disabled||(authState==='AUTHENTICATED'&&callState==='IDLE'&&!hasContact);
    button.setAttribute('aria-label',presentation.aria);
    if(label)label.textContent=presentation.actionLabel;
    if(hasContact){
      button.dataset.contactId=activeContact.id;
      button.dataset.contactName=activeContact.name;
    }else{
      delete button.dataset.contactId;
      delete button.dataset.contactName;
    }
  }
}

function setActiveContact(contactId,contactName){
  const previousId=activeContact?.id||null;
  if(!contactId){
    activeContact=null;
  }else{
    activeContact={id:String(contactId),name:String(contactName||'Liên hệ')};
  }
  renderCallFocus();
  syncContactActiveState();
  persistScreenSession();
  const nextId=activeContact?.id||null;
  if(previousId!==nextId){
    document.dispatchEvent(new CustomEvent('v21-active-contact-change',{detail:{contact:activeContact?{...activeContact}:null}}));
  }
}

const CallCommand={
  start(contactId,contactName){
    if(callState!=='IDLE')return false;
    clearCallTerminalNotice();
    callPendingAction=null;
    const targetId=String(contactId||activeContact?.id||'');
    const targetName=String(contactName||activeContact?.name||'Liên hệ');
    if(!targetId)return false;
    setActiveContact(targetId,targetName);
    const engine=window.V21CallEngine;
    if(!engine?.startOutgoing)return false;
    void engine.startOutgoing({contactId:targetId,contactName:targetName});
    renderCallFocus();
    return true;
  },
  enterOutgoing(contactId,contactName,call=null){
    if(callState!=='IDLE'&&callState!=='OUTGOING_RINGING')return false;
    if(callState==='IDLE'){
      const lease=interactionController()?.enter?.(interactionMode('CALL_RINGING'),{
        owner:'call-session',lockBaseUi:false
      });
      if(!lease)return false;
    }
    setActiveContact(contactId,contactName);
    if(!activeContact?.id){exitCallInteraction();return false;}
    callRole='CALLER';
    callState='OUTGOING_RINGING';
    callPendingAction=null;
    stopCallTimer();
    renderCallFocus();
    document.dispatchEvent(new CustomEvent('call-state',{detail:{state:callState,role:callRole,phase:callPhase(),contactId:activeContact.id,callId:call?.id||null}}));
    return true;
  },
  receiveIncoming(contactId,contactName,call=null){
    if(callState!=='IDLE'&&callState!=='INCOMING_RINGING')return false;
    if(callState==='IDLE'){
      const lease=interactionController()?.enter?.(interactionMode('CALL_RINGING'),{
        owner:'call-session',lockBaseUi:false
      });
      if(!lease)return false;
    }
    setActiveContact(contactId,contactName);
    if(!activeContact?.id){exitCallInteraction();return false;}
    callRole='CALLEE';
    callState='INCOMING_RINGING';
    callPendingAction=null;
    stopCallTimer();
    renderCallFocus();
    document.dispatchEvent(new CustomEvent('call-state',{detail:{state:callState,role:callRole,phase:callPhase(),contactId:activeContact.id,callId:call?.id||null}}));
    return true;
  },
  accept(){
    if(callState!=='INCOMING_RINGING')return false;
    const engine=window.V21CallEngine;
    if(!engine?.acceptCurrent)return false;
    callPendingAction='accept';
    void engine.acceptCurrent();
    renderCallFocus();
    return true;
  },
  enterConnecting(contactId,contactName,call=null){
    let lease=null;
    if(callState==='IDLE'){
      lease=interactionController()?.enter?.(interactionMode('CALL_CONNECTING'),{
        owner:'call-session',lockBaseUi:false
      });
    }else if(callState==='INCOMING_RINGING'||callState==='OUTGOING_RINGING'){
      lease=interactionController()?.transition?.(
        interactionMode('CALL_RINGING'),interactionMode('CALL_CONNECTING'),
        {owner:'call-session',lockBaseUi:false}
      );
    }else if(callState==='CONNECTING_AUDIO'){
      const snapshot=interactionController()?.snapshot?.()||{};
      if(snapshot.owner==='call-session'&&snapshot.mode===interactionMode('CALL_CONNECTING'))lease=snapshot;
    }else if(callState==='ACTIVE_AUDIO'){
      lease=interactionController()?.transition?.(
        interactionMode('AUDIO_CALL'),interactionMode('CALL_CONNECTING'),
        {owner:'call-session',lockBaseUi:false}
      );
    }
    if(!lease)return false;
    setActiveContact(contactId,contactName);
    callRole=String(call?.direction||'').toLowerCase()==='incoming'?'CALLEE':String(call?.direction||'').toLowerCase()==='outgoing'?'CALLER':callRole;
    clearCallTerminalNotice();
    callPendingAction=null;
    callState='CONNECTING_AUDIO';
    stopCallTimer();
    renderCallFocus();
    document.dispatchEvent(new CustomEvent('call-state',{detail:{state:callState,role:callRole,phase:callPhase(),contactId:activeContact?.id||null,callId:call?.id||null}}));
    return true;
  },
  enterActive(contactId,contactName,call=null){
    let lease=null;
    if(callState==='CONNECTING_AUDIO'){
      lease=interactionController()?.transition?.(
        interactionMode('CALL_CONNECTING'),interactionMode('AUDIO_CALL'),
        {owner:'call-session',lockBaseUi:false}
      );
    }else if(callState==='ACTIVE_AUDIO'){
      const snapshot=interactionController()?.snapshot?.()||{};
      if(snapshot.owner==='call-session'&&snapshot.mode===interactionMode('AUDIO_CALL'))lease=snapshot;
    }
    if(!lease)return false;
    setActiveContact(contactId,contactName);
    callRole=String(call?.direction||'').toLowerCase()==='incoming'?'CALLEE':String(call?.direction||'').toLowerCase()==='outgoing'?'CALLER':callRole;
    clearCallTerminalNotice();
    callPendingAction=null;
    callState='ACTIVE_AUDIO';
    startCallTimer(call?.mediaStartedAt||call?.media_started_at||null);
    renderCallFocus();
    document.dispatchEvent(new CustomEvent('call-state',{detail:{state:callState,role:callRole,phase:callPhase(),contactId:activeContact?.id||null,callId:call?.id||null}}));
    return true;
  },
  connected(call=null){
    const engineCall=call||window.V21CallEngine?.snapshot?.().call||null;
    return this.enterActive(
      engineCall?.peerAccountId||activeContact?.id,
      engineCall?.peerName||activeContact?.name,
      engineCall
    );
  },
  decline(){
    if(callState!=='INCOMING_RINGING')return false;
    const engine=window.V21CallEngine;
    if(!engine?.rejectCurrent)return false;
    void engine.rejectCurrent();
    renderCallFocus();
    return true;
  },
  hangup(){
    if(callState==='IDLE')return false;
    const engine=window.V21CallEngine;
    if(!engine?.stopCurrent)return false;
    void engine.stopCurrent({reason:'hangup'});
    renderCallFocus();
    return true;
  },
  endOptimistic(reason='hangup'){
    callState='IDLE';
    callRole='NONE';
    callPendingAction=null;
    stopCallTimer();
    showCallTerminalNotice(null,reason);
    renderCallFocus();
    exitCallInteraction();
    document.dispatchEvent(new CustomEvent('call-state',{detail:{state:callState,role:callRole,phase:callPhase(),reason:String(reason||'hangup')}}));
    return true;
  },
  resetFromEngine(reason='call-ended',call=null){
    callState='IDLE';
    callRole='NONE';
    callPendingAction=null;
    stopCallTimer();
    if(call?.status)showCallTerminalNotice(call,reason);
    else clearCallTerminalNotice();
    renderCallFocus();
    exitCallInteraction();
    document.dispatchEvent(new CustomEvent('call-state',{detail:{state:callState,role:callRole,phase:callPhase(),reason:String(reason||'call-ended')}}));
    return true;
  },
  refresh(){renderCallFocus();return true;},
  forceReset(){
    callState='IDLE';
    callRole='NONE';
    callPendingAction=null;
    clearCallTerminalNotice();
    stopCallTimer();
    renderCallFocus();
    exitCallInteraction();
    return true;
  }
};


function resolveInitialContact(rows){
  const valid=(Array.isArray(rows)?rows:[])
    .filter(item=>item?.id&&!item.deleted_at);
  if(valid.length!==1)return null;
  const contact=valid[0];
  return{
    id:String(contact.id),
    name:String(contact.display_name||contact.username||'Liên hệ')
  };
}

function reconcileActiveContactFromStore(detail={}){
  if(authState!=='AUTHENTICATED')return false;
  const items=Array.isArray(detail.contacts)?detail.contacts:[];
  const fallback=resolveInitialContact(items);

  // Bootstrap business rule: exactly one valid User ↔ Admin contact may be
  // resolved automatically. Zero contacts selects nothing; multi-contact never
  // guesses. Renderer remains DOM-only and owns none of this navigation.
  if(!activeContact?.id){
    if(!fallback)return false;
    setActiveContact(fallback.id,fallback.name);
    return true;
  }

  const current=items.find(item=>item?.id&&!item.deleted_at&&String(item.id)===String(activeContact.id))||null;
  if(current){
    const nextName=String(current.display_name||current.username||activeContact.name||'Liên hệ');
    if(nextName!==String(activeContact.name||''))setActiveContact(activeContact.id,nextName);
    return false;
  }

  // Contact/Navigation session owner resolves an invalid saved conversation.
  // End any call bound to the missing contact before switching/clearing it.
  if(callState==='INCOMING_RINGING')CallCommand.decline();
  else if(callState!=='IDLE')CallCommand.hangup();
  if(fallback)setActiveContact(fallback.id,fallback.name);
  else setActiveContact(null,null);
  return true;
}

let authMode='login';

function authField(name){return document.getElementById(`guest-auth-${name}`)}
function clearFieldInvalid(name){
  authField(name)?.removeAttribute('aria-invalid');
}
function setFieldInvalid(name){
  authField(name)?.setAttribute('aria-invalid','true');
}
function clearAuthErrors(){['name','account','password'].forEach(clearFieldInvalid)}


function initialsFor(value,fallback='TK'){
  const initials=String(value||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()||'').join('');
  return initials||fallback;
}

function accountAvatarColors(model){
  const key=String(model?.id||model?.username||model?.display_name||'account');
  let hash=0;
  for(let i=0;i<key.length;i++)hash=(Math.imul(hash,31)+key.charCodeAt(i))>>>0;
  const hue=hash%360;
  return{
    background:`hsl(${hue} 60% 88%)`,
    foreground:`hsl(${hue} 42% 20%)`
  };
}

function applyAvatarColors(node,model){
  if(!node)return;
  const colors=accountAvatarColors(model);
  node.style.setProperty('--account-avatar-bg',colors.background);
  node.style.setProperty('--account-avatar-fg',colors.foreground);
}

function profileStore(){return window.V21AccountProfileStore||null;}

function avatarUrlFor(path){
  return path?String(profileStore()?.avatarUrl?.(path)||''):'';
}

function renderAvatarNode(node,model,fallback='TK'){
  if(!node)return;
  applyAvatarColors(node,model);
  const display=String(model?.display_name||model?.username||'');
  const url=avatarUrlFor(model?.avatar_path);
  const signature=`${url}|${display}|${fallback}`;
  if(node.dataset.avatarSignature===signature)return;
  node.dataset.avatarSignature=signature;
  node.replaceChildren();
  if(url){
    const img=document.createElement('img');
    img.className='shell-avatar-image';
    img.alt='';
    img.src=url;
    node.appendChild(img);
  }else{
    node.textContent=initialsFor(display,fallback);
  }
}

function compactPreview(value){
  return String(value||'').replace(/\s+/g,' ').trim();
}

function formatContactTime(value){
  if(!value)return'';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return'';
  const now=new Date();
  const sameDay=date.getFullYear()===now.getFullYear()&&date.getMonth()===now.getMonth()&&date.getDate()===now.getDate();
  if(sameDay)return date.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',hour12:false});
  if(date.getFullYear()===now.getFullYear())return date.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'});
  return date.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'2-digit'});
}

function contactPreview(item){
  const kind=String(item?.preview_kind||'text');
  if(kind==='image')return'Ảnh';
  if(kind==='audio')return'Ghi âm';
  if(kind==='file')return'Tệp';
  return compactPreview(item?.preview_text)||'Chưa có tin nhắn';
}

function syncContactActiveState(){
  for(const row of document.querySelectorAll('[data-contact-row]')){
    row.dataset.active=String(Boolean(activeContact?.id)&&String(row.dataset.contactId)===String(activeContact.id));
  }
}

let profileOverlay=null;
let profilePreviewUrl='';
let profileReturnFocus=null;

function lockProfileBackground(){
  const lease=interactionController()?.enter?.(interactionMode('PROFILE_MODAL'),{
    owner:'profile-modal',lockBaseUi:true
  });
  if(!lease)return false;
  profileReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  try{profileReturnFocus?.blur?.();}catch{}
  return true;
}

function unlockProfileBackground({restoreFocus=true}={}){
  interactionController()?.exit?.(interactionMode('PROFILE_MODAL'),{owner:'profile-modal'});
  const returnFocus=profileReturnFocus;
  profileReturnFocus=null;
  if(restoreFocus&&returnFocus?.isConnected){window.setTimeout(()=>{try{returnFocus.focus({preventScroll:true});}catch{}},0);}
}

function closeProfileEditor({restoreFocus=true}={}){
  if(profilePreviewUrl){URL.revokeObjectURL(profilePreviewUrl);profilePreviewUrl='';}
  profileOverlay?.remove?.();
  profileOverlay=null;
  unlockProfileBackground({restoreFocus});
}

function profileFocusable(){
  if(!profileOverlay)return[];
  return [...profileOverlay.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(node=>!node.hidden&&node.getClientRects().length>0);
}

document.addEventListener('keydown',event=>{
  if(!profileOverlay)return;
  if(event.key==='Escape'){
    event.preventDefault();
    closeProfileEditor();
    return;
  }
  if(event.key==='Tab'){
    const nodes=profileFocusable();
    if(!nodes.length){event.preventDefault();return;}
    const first=nodes[0],last=nodes[nodes.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});

function buildProfileEditor({mode='self',account:target}={}){
  closeProfileEditor();
  const selfMode=mode==='self';
  const managed=mode==='admin'&&authAccount?.role==='admin'&&target?.role==='user';
  if(!selfMode&&!managed)return null;
  const model=selfMode?authAccount:target;
  if(!model?.id)return null;
  if(!lockProfileBackground())return null;

  const wrap=document.createElement('div');
  wrap.className='shell-profile-overlay';
  wrap.dataset.profileOverlay='';
  wrap.innerHTML=`
    <button type="button" class="shell-profile-backdrop" aria-label="Đóng"></button>
    <section class="shell-profile-card" role="dialog" aria-modal="true" aria-label="Hồ sơ">
      <header class="shell-profile-header">
        <h2></h2>
        <button type="button" class="shell-profile-close" aria-label="Đóng">×</button>
      </header>
      <form class="shell-profile-form" data-profile-form>
        <label class="shell-profile-avatar-picker">
          <span class="contact-avatar-source shell-profile-avatar" data-profile-avatar></span>
          <span class="shell-profile-avatar-label">Đổi ảnh</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" data-profile-avatar-file hidden>
        </label>
        <label class="shell-profile-field"><span>Tên</span><input type="text" maxlength="50" autocomplete="name" data-profile-name></label>
        <label class="shell-profile-field"><span>Mật khẩu mới</span><input type="password" minlength="6" maxlength="128" autocomplete="new-password" data-profile-password placeholder="Để trống nếu không đổi"></label>
        <p class="shell-profile-error" data-profile-error hidden></p>
        <button type="submit" class="shell-profile-save">Lưu</button>
      </form>
      <div class="shell-profile-admin-actions" data-profile-admin-actions hidden>
        <button type="button" class="shell-profile-secondary" data-profile-lock></button>
        <button type="button" class="shell-profile-danger" data-profile-delete>Xóa tài khoản</button>
      </div>
      <div class="shell-profile-confirm" data-profile-delete-confirm hidden>
        <div class="shell-profile-confirm-card" role="alertdialog" aria-labelledby="profile-delete-title" aria-describedby="profile-delete-copy">
          <strong id="profile-delete-title">Xóa tài khoản?</strong>
          <p id="profile-delete-copy">Tài khoản sẽ bị đăng xuất và không thể đăng nhập lại.</p>
          <div class="shell-profile-confirm-actions">
            <button type="button" class="shell-profile-secondary" data-profile-delete-cancel>Hủy</button>
            <button type="button" class="shell-profile-danger-solid" data-profile-delete-confirm-action>Xóa</button>
          </div>
        </div>
      </div>
    </section>`;

  const title=wrap.querySelector('.shell-profile-header h2');
  const nameInput=wrap.querySelector('[data-profile-name]');
  const passwordInput=wrap.querySelector('[data-profile-password]');
  const avatar=wrap.querySelector('[data-profile-avatar]');
  const fileInput=wrap.querySelector('[data-profile-avatar-file]');
  const errorNode=wrap.querySelector('[data-profile-error]');
  const adminActions=wrap.querySelector('[data-profile-admin-actions]');
  const lockButton=wrap.querySelector('[data-profile-lock]');
  const deleteButton=wrap.querySelector('[data-profile-delete]');
  const deleteConfirm=wrap.querySelector('[data-profile-delete-confirm]');
  const deleteCancel=wrap.querySelector('[data-profile-delete-cancel]');
  const deleteConfirmAction=wrap.querySelector('[data-profile-delete-confirm-action]');
  const saveButton=wrap.querySelector('.shell-profile-save');

  title.textContent=selfMode?'Hồ sơ':String(model.display_name||model.username||'Người dùng');
  nameInput.value=String(model.display_name||'');
  renderAvatarNode(avatar,model,'TK');

  if(managed){
    adminActions.hidden=false;
    lockButton.textContent=model.locked_at?'Mở khóa tài khoản':'Khóa tài khoản';
  }

  function setError(message=''){
    errorNode.textContent=message;
    errorNode.hidden=!message;
  }

  function setBusy(busy){
    wrap.dataset.busy=String(Boolean(busy));
    wrap.setAttribute('aria-busy',String(Boolean(busy)));
    for(const control of wrap.querySelectorAll('input,button'))control.disabled=Boolean(busy);
  }


  function applyProfileResult(result){
    const next=result?.account||null;
    if(!next)return;
    Object.assign(model,next);
    title.textContent=selfMode?'Hồ sơ':String(model.display_name||model.username||'Người dùng');
    nameInput.value=String(model.display_name||'');
    passwordInput.value='';
    fileInput.value='';
    if(profilePreviewUrl){URL.revokeObjectURL(profilePreviewUrl);profilePreviewUrl='';}
    renderAvatarNode(avatar,model,'TK');
    if(managed)lockButton.textContent=model.locked_at?'Mở khóa tài khoản':'Khóa tài khoản';
  }

  fileInput.addEventListener('change',()=>{
    const file=fileInput.files?.[0]||null;
    if(!file)return;
    if(file.size>2*1024*1024){setError('Ảnh tối đa 2 MB');fileInput.value='';return;}
    if(profilePreviewUrl)URL.revokeObjectURL(profilePreviewUrl);
    profilePreviewUrl=URL.createObjectURL(file);
    avatar.replaceChildren();
    const img=document.createElement('img');img.className='shell-avatar-image';img.alt='';img.src=profilePreviewUrl;avatar.appendChild(img);
    setError('');
  });

  wrap.querySelector('.shell-profile-backdrop').addEventListener('click',closeProfileEditor);
  wrap.querySelector('.shell-profile-close').addEventListener('click',closeProfileEditor);

  wrap.querySelector('[data-profile-form]').addEventListener('submit',async event=>{
    event.preventDefault();
    setError('');
    const store=profileStore();
    if(!store){setError('Không thể mở hồ sơ');return;}
    const payload={
      displayName:nameInput.value.trim(),
      password:passwordInput.value,
      avatarFile:fileInput.files?.[0]||null
    };
    if(!payload.displayName){setError('Tên không được để trống');return;}
    if(payload.password&&payload.password.length<6){setError('Mật khẩu tối thiểu 6 ký tự');return;}
    setBusy(true);
    try{
      const result=selfMode
        ?await store.updateSelf(payload)
        :await store.adminSaveUser({...payload,targetAccountId:String(model.id)});
      if(!result?.ok){setError(result?.message||'Không thể lưu thay đổi');return;}
      applyProfileResult(result);
      closeProfileEditor();
    }catch(error){setError(String(error?.message||'Không thể lưu thay đổi'));}
    finally{setBusy(false);}
  });

  lockButton?.addEventListener('click',async()=>{
    if(!managed)return;
    setBusy(true);setError('');
    try{
      const nextLocked=!Boolean(model.locked_at);
      const result=await profileStore()?.adminSetLocked?.({targetAccountId:String(model.id),locked:nextLocked});
      if(!result?.ok){setError(result?.message||'Không thể đổi trạng thái');return;}
      applyProfileResult(result);
      closeProfileEditor();
    }catch(error){setError(String(error?.message||'Không thể đổi trạng thái'));}
    finally{setBusy(false);}
  });

  deleteButton?.addEventListener('click',()=>{
    if(!managed)return;
    deleteConfirm.hidden=false;
    window.setTimeout(()=>deleteCancel?.focus?.({preventScroll:true}),0);
  });
  deleteCancel?.addEventListener('click',()=>{deleteConfirm.hidden=true;deleteButton?.focus?.({preventScroll:true});});
  deleteConfirmAction?.addEventListener('click',async()=>{
    if(!managed)return;
    setBusy(true);setError('');
    try{
      const result=await profileStore()?.adminDeleteUser?.({targetAccountId:String(model.id)});
      if(!result?.ok){deleteConfirm.hidden=true;setError(result?.message||'Không thể xóa tài khoản');return;}
      if(activeContact?.id&&String(activeContact.id)===String(model.id))setActiveContact(null,null);
      closeProfileEditor();
    }catch(error){deleteConfirm.hidden=true;setError(String(error?.message||'Không thể xóa tài khoản'));}
    finally{if(profileOverlay)setBusy(false);}
  });

  if(!globalOverlayRoot){
    unlockProfileBackground({restoreFocus:false});
    return null;
  }
  globalOverlayRoot.appendChild(wrap);
  profileOverlay=wrap;
  window.setTimeout(()=>nameInput.focus({preventScroll:true}),0);
  return wrap;
}

function openSelfProfile(){
  if(authState!=='AUTHENTICATED'||!authAccount)return AuthUI.openLogin();
  return buildProfileEditor({mode:'self',account:authAccount});
}

function openManagedProfile(item){
  if(authState!=='AUTHENTICATED'||authAccount?.role!=='admin'||item?.role!=='user')return null;
  return buildProfileEditor({mode:'admin',account:item});
}

function findRenderedContactRow(id){
  return [...document.querySelectorAll('[data-contact-row]')].find(row=>String(row.dataset.contactId)===String(id))||null;
}

function createRenderedContactRow(item){
  const row=document.createElement('div');
  row.className='shell-contact-row';
  row.dataset.contactRow='';
  row.dataset.contactId=String(item.id);
  row.dataset.active=String(Boolean(activeContact?.id)&&String(activeContact.id)===String(item.id));
  row.dataset.locked=String(Boolean(item.locked_at));

  const button=document.createElement('button');
  button.className='shell-contact-chat';
  button.type='button';
  button.dataset.contactSelect='';
  button.dataset.contactId=String(item.id);
  button.dataset.contactName=String(item.display_name||item.username||'Liên hệ');

  const avatarWrap=document.createElement('span');avatarWrap.className='shell-contact-avatar-wrap';
  const avatar=document.createElement('span');avatar.className='contact-avatar-source shell-contact-avatar';
  renderAvatarNode(avatar,item,'L');
  const unread=document.createElement('span');unread.className='shell-contact-unread-dot';unread.hidden=!Boolean(item.has_unread);unread.setAttribute('aria-hidden','true');
  avatarWrap.append(avatar,unread);

  const copy=document.createElement('span');copy.className='shell-contact-copy';
  const title=document.createElement('strong');title.className='shell-contact-name';title.textContent=String(item.display_name||item.username||'Liên hệ');
  const preview=document.createElement('span');preview.className='shell-contact-preview';
  const previewText=contactPreview(item);
  preview.textContent=item.locked_at?(previewText==='Chưa có tin nhắn'?'Đã khóa':`Đã khóa · ${previewText}`):previewText;
  copy.append(title,preview);

  const time=document.createElement('time');time.className='shell-contact-time';time.textContent=formatContactTime(item.latest_at);if(item.latest_at)time.dateTime=String(item.latest_at);
  button.append(avatarWrap,copy,time);
  row.appendChild(button);

  if(authAccount?.role==='admin'&&item.role==='user'){
    const manage=document.createElement('button');
    manage.type='button';manage.className='shell-contact-manage';manage.dataset.contactManage='';manage.dataset.contactId=String(item.id);manage.setAttribute('aria-label',`Quản lý ${title.textContent}`);manage.textContent='⋯';
    row.appendChild(manage);
  }
  return row;
}

function patchRenderedContact(item){
  if(!item?.id)return false;
  const row=findRenderedContactRow(item.id);
  if(!row)return false;
  row.dataset.locked=String(Boolean(item.locked_at));
  const button=row.querySelector('[data-contact-select]');
  if(button){button.dataset.contactName=String(item.display_name||item.username||'Liên hệ');}
  const avatar=row.querySelector('.shell-contact-avatar');
  if(avatar)renderAvatarNode(avatar,item,'L');
  const unread=row.querySelector('.shell-contact-unread-dot');
  if(unread)unread.hidden=!Boolean(item.has_unread);
  const title=row.querySelector('.shell-contact-name');
  if(title)title.textContent=String(item.display_name||item.username||'Liên hệ');
  const preview=row.querySelector('.shell-contact-preview');
  if(preview){
    const previewText=contactPreview(item);
    preview.textContent=item.locked_at?(previewText==='Chưa có tin nhắn'?'Đã khóa':`Đã khóa · ${previewText}`):previewText;
  }
  const time=row.querySelector('.shell-contact-time');
  if(time){time.textContent=formatContactTime(item.latest_at);if(item.latest_at)time.dateTime=String(item.latest_at);else time.removeAttribute('datetime');}
  const manage=row.querySelector('[data-contact-manage]');
  if(manage)manage.setAttribute('aria-label',`Quản lý ${String(item.display_name||item.username||'Liên hệ')}`);
  return true;
}

const AuthUI={
  openLogin(){
    NavigationCommand.openChat();
    this.setMode('login');
    const card=document.getElementById('guestAuthThread');
    card?.scrollIntoView({block:'center',behavior:'smooth'});
    window.setTimeout(()=>authField('account')?.focus({preventScroll:true}),180);
    return Boolean(card);
  },
  setMode(mode){
    authMode=mode==='register'?'register':'login';
    const card=document.getElementById('guestAuthThread');
    if(card)card.dataset.authMode=authMode;
    const title=document.getElementById('guest-auth-title');
    const primary=document.querySelector('[data-auth-primary-label]');
    const secondary=document.querySelector('[data-auth-secondary-label]');
    const password=authField('password');
    if(title)title.textContent=authMode==='register'?'Đăng ký':'Đăng nhập';
    if(primary)primary.textContent=authMode==='register'?'Đăng ký':'Đăng nhập';
    if(secondary)secondary.textContent=authMode==='register'?'Đăng nhập':'Đăng ký';
    if(password)password.autocomplete=authMode==='register'?'new-password':'current-password';
    clearAuthErrors();
    return authMode;
  },
  setError(code){
    clearAuthErrors();
    if(code==='invalid_credentials'){
      setFieldInvalid('account');
      setFieldInvalid('password');
      return;
    }
    if(code==='account_exists'){
      setFieldInvalid('account');
      return;
    }
    if(code==='weak_password'){
      setFieldInvalid('password');
      return;
    }
    if(code==='invalid_password'){
      setFieldInvalid('password');
      return;
    }
    if(code==='invalid_display_name'){
      setFieldInvalid('name');
      return;
    }
    if(code==='invalid_username'||code==='registration_failed'||code==='account_create_failed'){
      setFieldInvalid('account');
      return;
    }
    setFieldInvalid(authMode==='register'?'account':'password');
  },
  renderAccountFooter(){
    const footer=document.querySelector('[data-sidebar-account-footer]');
    if(!footer)return;
    const name=footer.querySelector('[data-account-name]');
    const handle=footer.querySelector('[data-account-handle]');
    const avatar=footer.querySelector('[data-account-avatar]');
    const action=footer.querySelector('[data-auth-command]');
    const actionLabel=footer.querySelector('[data-account-action-label]');
    const selfButtons=[...footer.querySelectorAll('[data-account-self-edit]')];
    const authenticated=authState==='AUTHENTICATED'&&authAccount;
    footer.dataset.state=authenticated?'authenticated':'guest';
    if(authenticated){
      if(name)name.textContent=String(authAccount.display_name||authAccount.username||'Tài khoản');
      if(handle)handle.textContent=authAccount.username?`@${String(authAccount.username).replace(/^@/,'')}`:'';
      renderAvatarNode(avatar,authAccount,'TK');
      for(const selfButton of selfButtons){selfButton.disabled=false;selfButton.setAttribute('aria-label','Đổi thông tin tài khoản');}
      if(action)action.dataset.authCommand='logout';
      if(actionLabel)actionLabel.textContent='Đăng xuất';
    }else{
      if(name)name.textContent='Vãng lai';
      if(handle)handle.textContent='Chưa đăng nhập';
      renderAvatarNode(avatar,null,'?');
      for(const selfButton of selfButtons){selfButton.disabled=false;selfButton.setAttribute('aria-label','Đăng nhập');}
      if(action)action.dataset.authCommand='login.open';
      if(actionLabel)actionLabel.textContent='Đăng nhập';
    }
  },
  renderContacts(contacts=[]){
    const host=document.querySelector('[data-v21-contact-list]');
    if(!host)return;
    const scrollHost=host.closest('.wm-sidebar-body');
    const previousScrollTop=scrollHost?.scrollTop||0;
    const items=Array.isArray(contacts)?contacts.filter(item=>item&&item.id&&!item.deleted_at):[];
    const existingById=new Map(
      [...host.querySelectorAll('[data-contact-row]')].map(row=>[String(row.dataset.contactId||''),row])
    );
    host.querySelector('.shell-contact-empty')?.remove();

    if(items.length===0){
      for(const row of existingById.values())row.remove();
      const empty=document.createElement('div');
      empty.className='shell-contact-empty';
      empty.textContent=authState==='AUTHENTICATED'?'Chưa có liên hệ':'Đăng nhập để xem danh bạ';
      host.appendChild(empty);
      // Renderer owns DOM only. Navigation/session owner decides whether the
      // active contact should change when the list becomes empty.
      if(scrollHost)scrollHost.scrollTop=previousScrollTop;
      return;
    }

    const desired=[];
    for(const item of items){
      const id=String(item.id);
      let row=existingById.get(id)||null;
      if(row){
        existingById.delete(id);
        patchRenderedContact(item);
      }else{
        row=createRenderedContactRow(item);
      }
      desired.push(row);
    }
    for(const stale of existingById.values())stale.remove();

    let cursor=host.firstElementChild;
    for(const row of desired){
      if(row===cursor)cursor=cursor.nextElementSibling;
      else host.insertBefore(row,cursor);
    }

    // Rendering contacts must never select, clear or rename the active
    // conversation. User navigation / explicit session restore owns that.
    syncContactActiveState();
    if(scrollHost)scrollHost.scrollTop=previousScrollTop;
  },
  patchContact(item){
    if(patchRenderedContact(item)){syncContactActiveState();return true;}
    return false;
  },
  removeContact(id){
    const row=findRenderedContactRow(id);
    if(row)row.remove();
    const host=document.querySelector('[data-v21-contact-list]');
    if(host&&!host.querySelector('[data-contact-row]'))this.renderContacts([]);
    return Boolean(row);
  },
  clearContacts(){
    this.renderContacts([]);
  },
  setAccount(account){
    authAccount=account?{...account}:null;
    this.renderAccountFooter();
  },
  setAuthenticated(authenticated,account=null){
    authState=authenticated?'AUTHENTICATED':'GUEST';
    if(appShell)appShell.dataset.authState=authenticated?'authenticated':'guest';
    this.setAccount(authenticated?account:null);
    syncDesktopSidebarMode();
  }
};

function requireAuthenticatedCommand(){
  if(authState==='AUTHENTICATED')return true;
  AuthUI.openLogin();
  return false;
}

document.addEventListener('submit',event=>{
  const form=event.target instanceof HTMLFormElement?event.target:null;
  if(form?.id==='composerForm'&&authState!=='AUTHENTICATED'){
    event.preventDefault();
    event.stopImmediatePropagation();
    AuthUI.openLogin();
  }
},true);

document.addEventListener('keydown',event=>{
  const target=event.target instanceof HTMLElement?event.target:null;
  if(target?.id==='editor'&&authState!=='AUTHENTICATED'&&event.key==='Enter'&&!event.shiftKey){
    event.preventDefault();
    event.stopImmediatePropagation();
    AuthUI.openLogin();
  }
},true);

document.addEventListener('v21-contact-store-change',event=>{
  reconcileActiveContactFromStore(event.detail||{});
});

document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  if(!target||authState==='AUTHENTICATED')return;
  if(target.closest('#send,#composer-plus-btn,#composer-mic-btn')){
    event.preventDefault();
    event.stopImmediatePropagation();
    AuthUI.openLogin();
  }
},true);

function handleCallFocus(button){
  if(!requireAuthenticatedCommand()){
    return;
  }
  if(callState==='IDLE'){
    CallCommand.start(button.dataset.contactId||activeContact?.id,button.dataset.contactName||activeContact?.name);
    return;
  }
  if(callState==='INCOMING_RINGING'){
    CallCommand.accept();
    return;
  }
  CallCommand.hangup();
}

document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  if(!target)return;

  const shellButton=target.closest('[data-shell-command]');
  if(shellButton){
    const command=shellButton.dataset.shellCommand;
    if(command==='sidebar.open')setSidebar(true);
    if(command==='sidebar.close')setSidebar(false);
    return;
  }

  const selfEdit=target.closest('[data-account-self-edit]');
  if(selfEdit){
    if(authState==='AUTHENTICATED')openSelfProfile();
    else AuthUI.openLogin();
    return;
  }

  const manage=target.closest('[data-contact-manage]');
  if(manage){
    const item=window.V21ContactStore?.snapshot?.().find(row=>String(row.id)===String(manage.dataset.contactId));
    if(item)openManagedProfile(item);
    return;
  }

  const contact=target.closest('[data-contact-select]');
  if(contact){
    setActiveContact(contact.dataset.contactId,contact.dataset.contactName);
    NavigationCommand.openChat();
    renderCallFocus();
    return;
  }

  const navTarget=target.closest('[data-nav-target]');
  if(navTarget){
    event.preventDefault();
    NavigationCommand.open(navTarget.dataset.navTarget);
    return;
  }

  const rejectButton=target.closest('[data-call-secondary-button]');
  if(rejectButton){
    CallCommand.decline();
    return;
  }

  const focusButton=target.closest('[data-call-focus-button]');
  if(focusButton){
    handleCallFocus(focusButton);
    return;
  }

  const authButton=target.closest('[data-auth-command]');
  if(authButton){
    const command=authButton.dataset.authCommand;
    if(command==='login.open'){
      AuthUI.openLogin();
      return;
    }
    if(command==='mode.switch'){
      AuthUI.setMode(authMode==='login'?'register':'login');
      window.setTimeout(()=>authField(authMode==='register'?'name':'account')?.focus({preventScroll:true}),0);
      return;
    }
    if(command==='logout'){
      window.V21InteractionController?.forceReset?.('logout');
      window.V21AuthSessionStore?.logout?.();
      return;
    }
  }
});

document.addEventListener('submit',event=>{
  const form=event.target instanceof HTMLFormElement?event.target:null;
  if(!form?.matches('[data-guest-auth-form]'))return;
  event.preventDefault();
  clearAuthErrors();
  const name=(authField('name')?.value??'').trim();
  const account=(authField('account')?.value??'').trim();
  const password=authField('password')?.value??'';
  let invalid=false;
  if(authMode==='register'&&!name){setFieldInvalid('name');invalid=true;}
  if(!account){setFieldInvalid('account');invalid=true;}
  if(!password){setFieldInvalid('password');invalid=true;}
  else if(authMode==='register'&&password.length<6){setFieldInvalid('password');invalid=true;}
  if(invalid){form.querySelector('[aria-invalid="true"]')?.focus({preventScroll:true});return;}
  const store=window.V21AuthSessionStore;
  if(!store){AuthUI.setError('auth_unavailable');return;}
  if(authMode==='register')store.register({name,account,password});
  else store.login({account,password});
});

document.addEventListener('input',event=>{
  const field=event.target instanceof HTMLInputElement?event.target:null;
  if(!field?.id?.startsWith('guest-auth-'))return;
  const key=field.id.replace('guest-auth-','');
  if(['name','account','password'].includes(key))clearFieldInvalid(key);
});

document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(profileOverlay){closeProfileEditor();return;}
  if(sidebarOpen)setSidebar(false);
});

document.addEventListener('v21-interaction-abort',()=>{
  if(profileOverlay)closeProfileEditor({restoreFocus:false});
  CallCommand.forceReset();
});

screenHost.dataset.route=route;
renderTopTabs();
renderCallFocus();
renderMenuUnread();
AuthUI.renderAccountFooter();
syncDesktopSidebarMode();

window.ChatAppShell={
  version:'V21.72.15',
  NavigationCommand,
  CallCommand,
  AuthUI,
  ScreenSession,
  UnreadIndicator,
  snapshot(){
    return{
      route,
      authState,
      authAccount:authAccount?{...authAccount}:null,
      sidebarOpen,
      desktopSidebarPersistent,
      callState,
      callRole,
      callPhase:callPhase(),
      activeContact:activeContact?{...activeContact}:null,
      unreadCount,
      callElapsed:callState==='ACTIVE_AUDIO'?currentElapsed():'00:00',
      callPresentation:callFocusPresentation().state,
      chatScreenMounted:chatScreen.isConnected,
      sessionHostMounted:Boolean(sessionHost?.isConnected),
      globalOverlayRootMounted:Boolean(globalOverlayRoot?.isConnected)
    };
  }
};
})();

