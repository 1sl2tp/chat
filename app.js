
(()=>{
'use strict';

const {
  deriveMessageKind,
  VIEWPORT_STATES,
  createMessage,
  MessageStore,
  ConversationViewportModel,
  DataWindowModel,
  estimateMessageHeight
}=window.ChatConversationCore;

const {
  KeyboardInsetModel
}=window.ChatKeyboardInsetCore;

const ChatGPTRef=window.ChatGPTVisualReference;
const P2PRef=window.P2PVisualReference;
const MESSAGE_FEATURES=Object.freeze({
  reply:true,
  important:false
});

const stageLayout=document.getElementById('stageLayout');
const scrollRoot=document.getElementById('scrollRoot');
const messageWindow=document.getElementById('messageWindow');
const topSpacer=document.getElementById('topSpacer');
const bottomSpacer=document.getElementById('bottomSpacer');
const historyStatus=document.getElementById('historyStatus');
const threadScrollControl=document.getElementById('threadScrollControl');
const threadScrollUnseenBadge=document.getElementById('threadScrollUnseenBadge');
const remoteTypingCenter=document.getElementById('remoteTypingCenter');
const modeLabel=document.getElementById('modeLabel');
const editor=document.getElementById('editor');
const measure=document.getElementById('measure');
const composerForm=document.getElementById('composerForm');
const composerShell=document.getElementById('composerShell');
const composerInteractive=document.getElementById('composerInteractive');
const plusButton=document.getElementById('composer-plus-btn');
const micButton=document.getElementById('composer-mic-btn');
const sendButton=document.getElementById('send');
const actionMenu=document.getElementById('composerActionMenu');
const uploadPhotosInput=document.getElementById('upload-photos');
const uploadCameraInput=document.getElementById('upload-camera');
const uploadIOSSourceInput=document.getElementById('upload-ios-source');
const uploadInput=document.getElementById('upload-files');
const attachmentTray=document.getElementById('attachmentTray');
const composerHint=document.getElementById('composerHint');
let composerMediaErrorText='';
const appShell=document.getElementById('appShell');
const screenHost=document.getElementById('screenHost');
const globalOverlayRoot=document.getElementById('globalOverlayRoot');

function audioCapturePolicy(){return window.V21AudioCapturePolicy||null;}

const InteractionMode=Object.freeze({
  NONE:'NONE',
  IMAGE_VIEWER:'IMAGE_VIEWER',
  PROFILE_MODAL:'PROFILE_MODAL',
  DUPLICATE_WARNING:'DUPLICATE_WARNING',
  AUDIO_RECORDING:'AUDIO_RECORDING',
  VIDEO_RECORDING:'VIDEO_RECORDING',
  CALL_RINGING:'CALL_RINGING',
  CALL_CONNECTING:'CALL_CONNECTING',
  AUDIO_CALL:'AUDIO_CALL',
  VIDEO_CALL:'VIDEO_CALL'
});

const InteractionController=(()=>{
  let mode=InteractionMode.NONE;
  let owner='';
  let generation=0;
  let locksBaseUi=false;
  let priorBaseUiState=null;

  function snapshot(){
    return{mode,owner,generation,locksBaseUi};
  }

  function publish(reason){
    document.dispatchEvent(new CustomEvent('v21-interaction-mode',{
      detail:{...snapshot(),reason:String(reason||'change')}
    }));
  }

  function setBaseUiLocked(locked){
    if(!screenHost)return;
    if(locked){
      if(priorBaseUiState)return;
      priorBaseUiState={
        inert:screenHost.hasAttribute('inert'),
        ariaHidden:screenHost.getAttribute('aria-hidden')
      };
      screenHost.setAttribute('inert','');
      screenHost.setAttribute('aria-hidden','true');
      screenHost.dataset.interactionLocked='true';
      return;
    }
    if(!priorBaseUiState){
      delete screenHost.dataset.interactionLocked;
      return;
    }
    if(!priorBaseUiState.inert)screenHost.removeAttribute('inert');
    if(priorBaseUiState.ariaHidden===null)screenHost.removeAttribute('aria-hidden');
    else screenHost.setAttribute('aria-hidden',priorBaseUiState.ariaHidden);
    delete screenHost.dataset.interactionLocked;
    priorBaseUiState=null;
  }

  function canEnter(next){
    const target=String(next||'');
    if(!target||target===InteractionMode.NONE)return false;
    return mode===InteractionMode.NONE||mode===target;
  }

  function enter(next,{owner:nextOwner='',lockBaseUi=false}={}){
    const target=String(next||'');
    const nextOwnerValue=String(nextOwner||target||'interaction');
    if(!canEnter(target))return null;
    if(mode===target){
      if(owner&&nextOwnerValue&&owner!==nextOwnerValue)return null;
      return snapshot();
    }
    mode=target;
    owner=nextOwnerValue;
    locksBaseUi=Boolean(lockBaseUi);
    generation+=1;
    if(locksBaseUi)setBaseUiLocked(true);
    publish('enter');
    return snapshot();
  }

  function transition(expected,next,{owner:expectedOwner='',lockBaseUi:nextLockBaseUi=locksBaseUi}={}){
    const expectedMode=String(expected||'');
    const target=String(next||'');
    if(mode!==expectedMode||!target||target===InteractionMode.NONE)return null;
    if(expectedOwner&&owner!==String(expectedOwner))return null;
    if(locksBaseUi&&!nextLockBaseUi)setBaseUiLocked(false);
    if(!locksBaseUi&&nextLockBaseUi)setBaseUiLocked(true);
    mode=target;
    locksBaseUi=Boolean(nextLockBaseUi);
    generation+=1;
    publish('transition');
    return snapshot();
  }

  function exit(expected,{owner:expectedOwner=''}={}){
    const expectedMode=String(expected||'');
    if(mode===InteractionMode.NONE)return false;
    if(expectedMode&&mode!==expectedMode)return false;
    if(expectedOwner&&owner!==String(expectedOwner))return false;
    if(locksBaseUi)setBaseUiLocked(false);
    mode=InteractionMode.NONE;
    owner='';
    locksBaseUi=false;
    generation+=1;
    publish('exit');
    return true;
  }

  function isLeaseCurrent(lease){
    return Boolean(
      lease &&
      lease.mode===mode &&
      lease.owner===owner &&
      Number(lease.generation)===generation
    );
  }

  function forceReset(reason='global-abort'){
    const previous=snapshot();
    document.dispatchEvent(new CustomEvent('v21-interaction-abort',{
      detail:{reason:String(reason||'global-abort'),previous}
    }));
    if(locksBaseUi)setBaseUiLocked(false);
    mode=InteractionMode.NONE;
    owner='';
    locksBaseUi=false;
    generation+=1;
    publish(reason);
    return previous;
  }

  return Object.freeze({
    snapshot,
    canEnter,
    enter,
    transition,
    exit,
    isLeaseCurrent,
    forceReset
  });
})();

window.V21InteractionMode=InteractionMode;
window.V21InteractionController=InteractionController;

const COMPOSER_SEND_MODE_KEY='taphoa.chat.v21.composerSendMode';
let composerSendMode=readComposerSendMode();

function readComposerSendMode(){
  try{
    return localStorage.getItem(COMPOSER_SEND_MODE_KEY)==='enter'
      ?'enter'
      :'button';
  }catch(_error){
    return 'button';
  }
}

function persistComposerSendMode(){
  try{
    localStorage.setItem(COMPOSER_SEND_MODE_KEY,composerSendMode);
  }catch(_error){
    // Preference persistence is optional; composer behavior remains usable.
  }
}

function composerModeHint(){
  return composerSendMode==='enter'
    ?'Return gửi · Shift+Return xuống dòng'
    :'Return xuống dòng · Return lần 2 gửi';
}

function isSmartBlankLineState(
  value,
  selectionStart,
  selectionEnd,
  mode
){
  if(mode!=='button')return false;
  if(
    selectionStart!==selectionEnd ||
    selectionStart!==value.length
  )return false;

  const before=String(value||'')
    .slice(0,selectionStart)
    .replace(/\r\n/g,'\n');
  const lastBreak=before.lastIndexOf('\n');
  if(lastBreak<0)return false;

  const currentLine=before.slice(lastBreak+1);
  const contentBefore=before.slice(0,lastBreak);
  return (
    currentLine.trim()==='' &&
    contentBefore.trim().length>0
  );
}

function shouldSmartSendOnBlankLine(){
  return isSmartBlankLineState(
    editor.value,
    editor.selectionStart,
    editor.selectionEnd,
    composerSendMode
  );
}

function composerEnterAction({
  mode=composerSendMode,
  shiftKey=false,
  value=editor.value,
  selectionStart=editor.selectionStart,
  selectionEnd=editor.selectionEnd
}={}){
  if(shiftKey)return 'newline';
  if(mode==='enter')return 'send';
  return isSmartBlankLineState(value,selectionStart,selectionEnd,mode)
    ?'send'
    :'newline';
}

function renderComposerModeHint(){
  if(mediaRecorder&&mediaRecorder.state==='recording')return;
  if(audioWorkflowState==='REQUESTING_PERMISSION'){composerHint.textContent='Đang mở micro…';return;}
  if(audioWorkflowState==='STOPPING'){composerHint.textContent='Đang tạo bản xem trước…';return;}
  if(audioWorkflowState==='SENDING'){composerHint.textContent='Đang xếp hàng gửi ghi âm…';return;}
  if(composerMediaErrorText){composerHint.textContent=composerMediaErrorText;return;}
  composerHint.textContent=composerModeHint();
}
function clearComposerMediaError(){
  composerMediaErrorText='';
  composerShell?.removeAttribute?.('data-media-send-error');
}
function showComposerMediaError(detail={}){
  const code=String(detail?.code||detail?.status||'').trim();
  const message=String(detail?.message||'media_send_failed').replace(/^Error:\s*/i,'').trim();
  const short=message.length>90?`${message.slice(0,87)}…`:message;
  const label=String(detail?.label||'Tệp chưa gửi');
  composerMediaErrorText=`${label}${code?` · ${code}`:''}${short?` · ${short}`:''}`;
  composerShell?.setAttribute?.('data-media-send-error','true');
  renderComposerModeHint();
}
document.addEventListener('v21-media-outbox-error',event=>{
  const detail=event?.detail||{};
  const scope=currentComposerScope();
  if(detail?.conversationId&&String(detail.conversationId)!==String(scope.conversationId||''))return;
  // Outbox failure belongs to the queued message bubble after Composer commit.
  // Only surface it inside Composer if the exact failed asset is still owned by
  // the visible draft. This prevents an old audio failure from leaking into a
  // later image/file draft (e.g. "Ghi âm chưa gửi · 400" while sending an image).
  const failedIds=new Set((Array.isArray(detail?.assetIds)?detail.assetIds:[])
    .map(value=>String(value||'')).filter(Boolean));
  const owned=pendingAttachments.find(item=>failedIds.has(String(item?.assetId||'')))||null;
  if(!owned)return;
  const label=owned.kind==='audio'?'Ghi âm chưa gửi':(owned.kind==='image'?'Ảnh chưa gửi':'Tệp chưa gửi');
  detail.label=label;
  showComposerMediaError(detail);
});
function committedMediaAssetIds(detail={}){
  return Array.from(new Set(
    (Array.isArray(detail?.assetIds)?detail.assetIds:[])
      .map(value=>String(value||''))
      .filter(Boolean)
  ));
}

function mediaAttachmentMatchesCommittedScope(item,{assetIds,accountId='',conversationId=''}={}){
  const id=String(item?.assetId||'');
  if(!id||!assetIds?.has?.(id))return false;
  if(accountId&&String(item?.accountId||'')!==String(accountId))return false;
  if(conversationId&&String(item?.conversationId||'')!==String(conversationId))return false;
  return true;
}

function consumeCommittedMediaFromComposer(detail={}){
  const ids=committedMediaAssetIds(detail);
  if(!ids.length)return false;
  const assetIds=new Set(ids);
  const accountId=String(detail?.accountId||'');
  const conversationId=String(detail?.conversationId||'');
  const removedVisible=[];
  pendingAttachments=pendingAttachments.filter(item=>{
    const matched=mediaAttachmentMatchesCommittedScope(item,{assetIds,accountId,conversationId});
    if(matched)removedVisible.push(item);
    return !matched;
  });

  for(const [key,draft] of Array.from(ComposerDraftOwner.drafts.entries())){
    if(accountId&&!String(key).startsWith(`${accountId}::`))continue;
    const nextAttachments=(draft?.attachments||[]).filter(item=>
      !mediaAttachmentMatchesCommittedScope(item,{assetIds,accountId,conversationId})
    );
    if(nextAttachments.length===(draft?.attachments||[]).length)continue;
    const next={...draft,attachments:nextAttachments};
    if(ComposerDraftOwner.isEmpty(next))ComposerDraftOwner.drafts.delete(key);
    else ComposerDraftOwner.drafts.set(key,next);
  }

  if(!removedVisible.length)return false;
  promoteSentMediaPreviewOwnership(removedVisible);
  if(editor.value||pendingAttachments.length||replyTarget)ComposerDraftOwner.saveCurrent();
  else ComposerDraftOwner.commitEmptyCurrent();
  renderAttachmentTray();
  if(!pendingAttachments.some(item=>item?.kind==='audio')&&!(mediaRecorder&&mediaRecorder.state!=='inactive')){
    setAudioWorkflowState('IDLE');
  }else{
    syncSendButtonState();
    renderComposerModeHint();
  }
  return true;
}

document.addEventListener('v21-media-outbox-sent',event=>{
  const detail=event?.detail||{};
  consumeCommittedMediaFromComposer(detail);
  const scope=currentComposerScope();
  if(detail?.conversationId&&String(detail.conversationId)!==String(scope.conversationId||''))return;
  clearComposerMediaError();
  renderComposerModeHint();
});
const replyContext=document.getElementById('replyContext');
const replyContextLabel=document.getElementById('replyContextLabel');
const replyContextText=document.getElementById('replyContextText');
const replyContextClose=document.getElementById('replyContextClose');
const bottomContainer=document.getElementById('thread-bottom-container');
const regionTop=document.getElementById('regionTop');
const threadContent=document.getElementById('threadContent');
const tailRunway=document.getElementById('tailRunway');
const tailRunwaySpace=document.getElementById('tailRunwaySpace');
const remote=document.getElementById('remote');
const svhProbe=document.getElementById('svhProbe');
const runtimeError=document.getElementById('runtimeError');
const vv=window.visualViewport;

function runtimeErrorMessage(error){
  if(error instanceof Error)return `${error.name}: ${error.message}`;
  if(error&&typeof error==='object'){
    const named=String(error.message||error.error_description||error.details||error.hint||error.code||'').trim();
    if(named)return named;
    try{return JSON.stringify(error); }catch(_error){return Object.prototype.toString.call(error);}
  }
  return String(error);
}

const AppBootController={
  phase:'BOOT',
  fail(error){
    const message=runtimeErrorMessage(error);

    this.phase='ERROR';
    modeLabel.textContent='ERROR';
    runtimeError.textContent='V21.72.19 runtime: '+message;
    runtimeError.classList.remove('hidden');
    console.error('[ChatScreenModule V21.72.19]',error);
  },
  ready(){
    this.phase='READY';
    modeLabel.textContent=viewport.mode;
  }
};

function isOwnedRuntimeErrorEvent(event){
  const message=String(event?.message||'').trim();
  const filename=String(event?.filename||'').trim();

  // Safari/file:// and browser extensions can surface an opaque cross-origin
  // ErrorEvent as exactly "Script error." with no usable Error object.
  // Browser/platform/external scripts are outside ChatScreen ownership, so do
  // not convert that opaque event into an application ERROR banner.
  if(!event?.error&&(message==='Script error.'||message==='Script error')){
    console.warn('[ChatScreenModule] ignored opaque external Script error.',event);
    return false;
  }

  // If the browser gives us a filename, only claim errors from the current
  // document/origin. This prevents CDN/extension failures being mislabeled as
  // Chat runtime failures while still preserving first-party app errors.
  if(filename){
    try{
      const eventUrl=new URL(filename,location.href);
      if(location.protocol==='file:')return eventUrl.protocol==='file:';
      return eventUrl.origin===location.origin;
    }catch(_error){
      return true;
    }
  }

  return true;
}

window.addEventListener('error',e=>{
  if(!isOwnedRuntimeErrorEvent(e))return;
  AppBootController.fail(
    e.error || new Error(e.message || 'Unknown runtime error')
  );
});
window.addEventListener('unhandledrejection',e=>{
  AppBootController.fail(
    e.reason || new Error('Unhandled promise rejection')
  );
});

const mobile=
  matchMedia('(pointer:coarse)').matches &&
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

const appleTouchPlatform=Boolean(
  /iPhone|iPad|iPod/i.test(navigator.userAgent||'') ||
  (navigator.platform==='MacIntel' && Number(navigator.maxTouchPoints||0)>1)
);

/* =========================================================
   V21.72.19 VIEWPORT POLICY + CANONICAL CONVERSATION/COMPOSER SCOPE
   RuntimeAdapter answers WHERE. RuntimeProfile answers small Web/App deltas.
   Chat/Scroll/Media/Audio/Call do not fork by iOS/Android/PWA.
   ========================================================= */
const RuntimeAdapter=Object.freeze({
  isStandalone(){
    return Boolean(
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone===true
    );
  },
  isIOS(){ return appleTouchPlatform; },
  isAndroid(){ return /Android/i.test(window.navigator.userAgent||''); },
  identify(){
    const standalone=this.isStandalone();
    if(this.isIOS())return standalone?'ios-pwa':'ios-web';
    if(this.isAndroid())return standalone?'android-pwa':'android-web';
    return standalone?'desktop-app':'desktop-web';
  },
  isMobile(){
    const id=this.identify();
    return id==='ios-web'||id==='ios-pwa'||id==='android-web'||id==='android-pwa';
  }
});

const RuntimeProfiles=Object.freeze({
  'desktop-web':Object.freeze({keyboardVisualGapPx:6,threadComponentGapPx:24,lockDocumentViewport:false,pickerMode:'app-2'}),
  'desktop-app':Object.freeze({keyboardVisualGapPx:0,threadComponentGapPx:24,lockDocumentViewport:false,pickerMode:'app-2'}),
  'ios-web':Object.freeze({keyboardVisualGapPx:6,threadComponentGapPx:24,lockDocumentViewport:true,pickerMode:'ios-native'}),
  'ios-pwa':Object.freeze({keyboardVisualGapPx:0,threadComponentGapPx:24,lockDocumentViewport:true,pickerMode:'ios-native'}),
  'android-web':Object.freeze({keyboardVisualGapPx:6,threadComponentGapPx:24,lockDocumentViewport:false,pickerMode:'app-3'}),
  'android-pwa':Object.freeze({keyboardVisualGapPx:0,threadComponentGapPx:24,lockDocumentViewport:false,pickerMode:'app-3'})
});

const runtimeId=RuntimeAdapter.identify();
const RuntimeProfile=Object.freeze(
  RuntimeProfiles[runtimeId] || RuntimeProfiles['desktop-web']
);

document.documentElement.dataset.runtime=runtimeId;
for(const [key,value] of Object.entries(RuntimeProfile)){
  if(!Number.isFinite(value))continue;
  const cssName='--runtime-'+key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase());
  document.documentElement.style.setProperty(cssName,`${value}px`);
}
document.documentElement.toggleAttribute(
  'data-runtime-document-viewport-lock',
  Boolean(RuntimeProfile.lockDocumentViewport)
);
window.V21RuntimeAdapter=RuntimeAdapter;
window.V21RuntimeProfiles=RuntimeProfiles;
window.V21RuntimeProfile=RuntimeProfile;
window.V21PlatformRuntimeId=runtimeId;
window.V21BuildMetadata=Object.freeze({
  releaseVersion:'V21.72.19',
  moduleVersionPolicy:'contract-version-independent'
});
// V21RuntimeId is owned by runtime-id.js and must remain the asset/client ID generator.

/* RuntimeUI owns document-level panning only. Safari may move the document
   viewport to reveal a focused textarea even though the app has its own
   ScrollRoot. This guard never writes conversation scrollTop. */
const RuntimeDocumentViewportGuard=Object.freeze({
  enabled:Boolean(RuntimeProfile.lockDocumentViewport),
  normalize(){
    if(!this.enabled)return false;
    const root=document.scrollingElement;
    const x=Math.round(window.scrollX||root?.scrollLeft||0);
    const y=Math.round(window.scrollY||root?.scrollTop||0);
    if(!x&&!y)return false;
    if(root){root.scrollLeft=0;root.scrollTop=0;}
    try{window.scrollTo(0,0);}catch(_error){}
    return true;
  },
  schedule(){
    if(!this.enabled)return;
    requestAnimationFrame(()=>this.normalize());
  }
});
window.V21RuntimeDocumentViewportGuard=RuntimeDocumentViewportGuard;
if(RuntimeDocumentViewportGuard.enabled){
  window.addEventListener('scroll',()=>RuntimeDocumentViewportGuard.normalize(),{passive:true});
  window.addEventListener('focus',()=>RuntimeDocumentViewportGuard.schedule(),{passive:true});
  document.addEventListener('focusin',()=>RuntimeDocumentViewportGuard.schedule(),{passive:true});
  vv?.addEventListener('resize',()=>RuntimeDocumentViewportGuard.schedule(),{passive:true});
  vv?.addEventListener('scroll',()=>RuntimeDocumentViewportGuard.schedule(),{passive:true});
}

function shouldRestoreEditorFocusAfterAction(){
  // Desktop keeps the fast physical-keyboard workflow. Mobile Web/PWA never
  // manufactures a second software-keyboard transition after media/send.
  return runtimeId==='desktop-web' || runtimeId==='desktop-app';
}


function hydrateChatGPTReferenceIcons(){
  if(!ChatGPTRef)return;

  const scrollHost=document.getElementById('threadScrollArrow');
  const scrollMarkup=ChatGPTRef.iconMarkup('scroll-down');

  if(scrollHost && scrollMarkup){
    const holder=document.createElement('div');
    holder.innerHTML=scrollMarkup;
    const svg=holder.firstElementChild;

    if(svg){
      svg.id='threadScrollArrow';
      svg.dataset.chatgptSourceIcon='scroll-down';
      svg.classList.add('thread-scroll-arrow');
      scrollHost.replaceWith(svg);
    }
  }
}

hydrateChatGPTReferenceIcons();

if(replyContextClose && P2PRef){replyContextClose.innerHTML=P2PRef.iconMarkup('close');}

/* =========================================================
   DATA
   ========================================================= */
const TOTAL=0;
const historyItems=[];

const store=new MessageStore();
const viewport=new ConversationViewportModel();
const dataWindow=new DataWindowModel({
  maxDomMessages:120,
  overscan:20
});
const heightCache=new Map();

let olderCursor=Math.max(0,TOTAL-50);
let loadingOlder=false;
let renderedRange={start:0,end:0};
let seq=0;

// ScrollController runtime state. These are the only mutable scroll mechanics
// outside the 3-state viewport model: user-intent detection and one coalesced
// programmatic tail transaction. Composer/keyboard code never touches them.
let programmaticScroll=false;
let userDragging=false;
let userScrollIdleTimer=0;
let lastUserScrollTop=0;
let userScrollIntentUntil=0;
let userScrollIntentTimer=0;
let pendingTailFrame=0;
let pendingTailReason='';
let pendingTailToken=0;
let pendingGeometryTailFrame=0;
const pendingGeometryTailReasons=new Set();
let interactionGeometryAnchor=null;
let pendingInteractionAnchorFrame=0;
let interactionAnchorGeneration=0;
let tailRevealTargetMessageId='';
let conversationViewEpoch=0;


/* =========================================================
   V21.64 COMPOSER PLACEMENT CONTRACT

   KEYBOARD CLOSED:
     stageLayout -> thread-bottom-container = absolute bottom-0 sibling overlay
     normal app-owned bottom gap = 24px

   KEYBOARD OPEN:
     VisualViewport bottom = visualViewport.offsetTop + visualViewport.height
     thread-bottom-container switches to position:fixed
     JS publishes ONE top coordinate:
       --composer-visual-top =
       visualBottom - composerHeight - keyboardVisualGap
     keyboardVisualGap:
       Safari web = 6px
       standalone/PWA = 0px
     Composer margin-bottom becomes 0.
     safe-area is NOT added in this state.

   FLOW / TAIL STABILITY:
     composerPlacementSpacer is the ONLY physical obstruction reserve inside
     ScrollRoot. It carries Composer height plus keyboard occlusion metadata.
     ScrollRoot bottom scroll-padding stays zero; no translated tail shim exists.

   SAFE-SCROLL:
     --screen-keyboard-height is telemetry only. VisualViewport positions the
     Composer; it never becomes a ScrollRoot scroll-padding owner.

   FORBIDDEN:
   - sticky + visual offset at the same time
   - safe-area + keyboard offset double counting
   - bottom:env(safe-area-inset-bottom) while visual placement owns bottom
   - second Composer instance/layer
   ========================================================= */

/* =========================================================
   PLATFORM KEYBOARD INSET
   - DOES NOT position Stage/Header/Composer.
   - Only publishes safe-scroll metadata.
   ========================================================= */
const KeyboardInsetAdapter={
  thresholdPx:80,

  keyboardVisualGap(){
    return Math.max(0,Number(RuntimeProfile.keyboardVisualGapPx)||0);
  },

  supportsSoftwareKeyboardPlacement(){
    return Boolean(
      Number(window.navigator.maxTouchPoints||0)>0 ||
      window.matchMedia?.('(pointer:coarse)').matches ||
      /iPhone|iPad|iPod|Android/i.test(window.navigator.userAgent||'')
    );
  },
  layoutBottom:Math.round(
    svhProbe.getBoundingClientRect().height || innerHeight
  ),
  restingVisualHeight:Math.round(
    vv?.height || innerHeight
  ),
  current:0,
  open:false,

  read(){
    const focused=document.activeElement===editor;

    if(!vv){
      return{
        focused,
        visualTop:0,
        visualHeight:innerHeight,
        visualBottom:innerHeight,
        occlusion:0
      };
    }

    const visualTop=Math.max(
      0,
      Math.round(vv.offsetTop||0)
    );
    const visualHeight=Math.max(
      1,
      Math.round(vv.height)
    );
    const visualBottom=visualTop+visualHeight;

    if(!focused){
      this.restingVisualHeight=Math.max(
        this.restingVisualHeight,
        visualHeight
      );
    }

    const heightDrop=Math.max(
      0,
      this.restingVisualHeight-visualHeight
    );
    const layoutOcclusion=Math.max(
      0,
      this.layoutBottom-visualBottom
    );

    return{
      focused,
      visualTop,
      visualHeight,
      visualBottom,
      occlusion:Math.max(
        heightDrop,
        layoutOcclusion
      )
    };
  },

  placeOnVisualViewport(state){
    const firstHeight=Math.max(
      1,
      Math.ceil(
        bottomContainer.getBoundingClientRect().height
      )
    );

    scrollRoot.style.setProperty(
      '--composer-flow-reserve',
      `${firstHeight}px`
    );
    stageLayout.style.setProperty(
      '--composer-visual-top',
      `${Math.max(
        state.visualTop,
        state.visualBottom-
        firstHeight-
        this.keyboardVisualGap()
      )}px`
    );
    scrollRoot.dataset.composerPlacement='visual-viewport';
    stageLayout.dataset.composerPlacement='visual-viewport';

    requestAnimationFrame(()=>{
      if(
        stageLayout.dataset.composerPlacement!=='visual-viewport' ||
        !vv
      )return;

      const actualHeight=Math.max(
        1,
        Math.ceil(
          bottomContainer.getBoundingClientRect().height
        )
      );
      const visualTop=Math.max(
        0,
        Math.round(vv.offsetTop||0)
      );
      const visualBottom=
        visualTop+
        Math.max(1,Math.round(vv.height));

      scrollRoot.style.setProperty(
        '--composer-flow-reserve',
        `${actualHeight}px`
      );
      stageLayout.style.setProperty(
        '--composer-visual-top',
        `${Math.max(
          visualTop,
          visualBottom-
          actualHeight-
          this.keyboardVisualGap()
        )}px`
      );

      publishComposerHeight();
    });
  },

  restoreStickyPlacement(){
    scrollRoot.dataset.composerPlacement='sticky';
    stageLayout.dataset.composerPlacement='sticky';
    stageLayout.style.removeProperty('--composer-visual-top');
  },

  update(){
    const state=this.read();
    const keyboardOpen=
      Boolean(vv) &&
      this.supportsSoftwareKeyboardPlacement() &&
      state.focused &&
      state.occlusion>=this.thresholdPx;

    this.open=keyboardOpen;
    scrollRoot.dataset.keyboardOpen=String(keyboardOpen);
    stageLayout.dataset.keyboardOpen=String(keyboardOpen);

    const next=keyboardOpen
      ?Math.max(0,Math.round(state.occlusion))
      :0;

    this.current=next;
    scrollRoot.style.setProperty(
      '--screen-keyboard-height',
      `${next}px`
    );

    if(keyboardOpen){
      this.placeOnVisualViewport(state);
    }else{
      this.restoreStickyPlacement();
    }
  },

  onOrientation(){
    requestAnimationFrame(()=>{
      this.layoutBottom=Math.round(
        svhProbe.getBoundingClientRect().height ||
        innerHeight
      );
      if(!this.open){
        this.restingVisualHeight=Math.round(
          vv?.height || innerHeight
        );
      }
      this.update();
    });
  }
};


if(vv){
  vv.addEventListener(
    'resize',
    ()=>KeyboardInsetAdapter.update(),
    {passive:true}
  );
  vv.addEventListener(
    'scroll',
    ()=>KeyboardInsetAdapter.update(),
    {passive:true}
  );
}
window.addEventListener(
  'orientationchange',
  ()=>KeyboardInsetAdapter.onOrientation(),
  {passive:true}
);

/* =========================================================
   COMPOSER HEIGHT -> inert ScrollRoot spacer only.
   It never writes scrollTop, viewport state or scroll-padding.
   ========================================================= */
const P2P_TAIL_RUNWAY_PX=0;

function publishTailRunway(){
  /*
    ChatGPT keeps a large AI-response runway because a new assistant turn
    is expected to stream below the user prompt. This app is P2P, so that
    runway would incorrectly pull every new chat line to the top.
    Keep the structural sentinel but no artificial blank tail.
  */
  tailRunway.style.setProperty(
    '--gutter-remaining-height',
    `${P2P_TAIL_RUNWAY_PX}px`
  );
}

function publishComposerHeight(){
  const h=Math.ceil(
    bottomContainer.getBoundingClientRect().height
  );
  const safeHeight=Math.max(0,h);
  const keyboardReserve=KeyboardInsetAdapter.open
    ?Math.max(0,Number(KeyboardInsetAdapter.current)||0)
    :0;
  const totalReserve=safeHeight+keyboardReserve;
  const reserveValue=`${totalReserve}px`;

  // ScrollRoot receives only an inert obstruction reserve. It does not receive
  // Composer input/focus events and does not move while the user is typing.
  const previousReserve=scrollRoot.style.getPropertyValue('--composer-flow-reserve').trim();
  if(previousReserve!==reserveValue){
    scrollRoot.style.setProperty('--composer-flow-reserve',reserveValue);
    // Obstruction geometry changed (Composer growth/shrink or keyboard inset).
    // Preserve the logical tail only when Scroll policy is already FOLLOW_TAIL.
    // USER_AWAY is never pulled back by Composer/keyboard geometry.
    publishViewportGeometryChange('composer-obstruction');
  }

  if(stageLayout.dataset.composerPlacement==='visual-viewport'&&vv){
    const visualTop=Math.max(0,Math.round(vv.offsetTop||0));
    const visualBottom=visualTop+Math.max(1,Math.round(vv.height));
    stageLayout.style.setProperty(
      '--composer-visual-top',
      `${Math.max(
        visualTop,
        visualBottom-safeHeight-KeyboardInsetAdapter.keyboardVisualGap()
      )}px`
    );
  }

  publishTailRunway();
}


const composerObserver=
  typeof ResizeObserver!=='undefined'
    ?new ResizeObserver(()=>publishComposerHeight())
    :null;

composerObserver?.observe(bottomContainer);

// Async media/file hydration can change a mounted message height after the
// original render transaction has already settled. Observe only the message
// window's geometry; this observer never writes scrollTop. It emits one
// coalesced geometry intent back to ScrollRoot, which remains the sole writer.
const messageWindowGeometryObserver=
  typeof ResizeObserver!=='undefined'
    ?new ResizeObserver(()=>{
      publishViewportGeometryChange('message-window-reflow');
    })
    :null;

messageWindowGeometryObserver?.observe(messageWindow);

/* =========================================================
   VIEWPORT / WINDOWING
   ========================================================= */
function composerFlowReservePx(){
  return Math.max(0,parseFloat(
    scrollRoot.style.getPropertyValue('--composer-flow-reserve')||'0'
  )||0);
}

function distanceFromTail(){
  // Composer/keyboard reserve is geometry only, not conversation content.
  // Growing the input must not make the user "away from tail".
  return Math.max(
    0,
    scrollRoot.scrollHeight-
    composerFlowReservePx()-
    scrollRoot.scrollTop-
    scrollRoot.clientHeight
  );
}


function messageLayoutWidthPx(){
  // Virtual-window estimates must use the same horizontal geometry owner as
  // Header / messages / Composer. Using the full ScrollRoot width on desktop
  // makes offscreen spacer estimates disagree with the actually rendered
  // 48rem content axis and causes shrink/jump when rows are materialized.
  const axis=regionTop?.querySelector?.('.chat-content-axis')||null;
  if(!axis)return Math.max(180,scrollRoot.clientWidth-24);
  const rect=axis.getBoundingClientRect();
  const style=getComputedStyle(axis);
  const padding=(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0);
  return Math.max(180,Math.round(rect.width-padding));
}

function setScrollTop(value){
  programmaticScroll=true;
  scrollRoot.scrollTop=Math.max(0,value);

  requestAnimationFrame(()=>{
    programmaticScroll=false;
    lastUserScrollTop=scrollRoot.scrollTop;
  });
}

function markUserScrollIntent(duration=700){
  clearInteractionGeometryAnchor();
  tailRevealTargetMessageId='';
  userScrollIntentUntil=Math.max(userScrollIntentUntil,Date.now()+Math.max(120,Number(duration)||700));
  scrollRoot.setAttribute('data-user-scroll-intent','true');
  clearTimeout(userScrollIntentTimer);
  userScrollIntentTimer=setTimeout(()=>{
    if(Date.now()>=userScrollIntentUntil)scrollRoot.removeAttribute('data-user-scroll-intent');
  },Math.max(140,Number(duration)||700)+20);
}

function hasUserScrollIntent(){
  return userDragging || Date.now()<userScrollIntentUntil;
}

function clearUserScrollIntentForExplicitTail(){
  userScrollIntentUntil=0;
  clearTimeout(userScrollIntentTimer);
  userScrollIntentTimer=0;
  scrollRoot.removeAttribute('data-user-scroll-intent');
  setUserDragging(false);
  clearTimeout(userScrollIdleTimer);
  userScrollIdleTimer=0;
  scrollRoot.removeAttribute('data-user-scrolling');
}

function cancelPendingTailTransaction(){
  pendingTailToken+=1;
  tailRevealTargetMessageId='';
  if(pendingTailFrame)cancelAnimationFrame(pendingTailFrame);
  pendingTailFrame=0;
  pendingTailReason='';
  if(pendingGeometryTailFrame)cancelAnimationFrame(pendingGeometryTailFrame);
  pendingGeometryTailFrame=0;
  pendingGeometryTailReasons.clear();
  if(pendingInteractionAnchorFrame)cancelAnimationFrame(pendingInteractionAnchorFrame);
  pendingInteractionAnchorFrame=0;
  interactionGeometryAnchor=null;
  interactionAnchorGeneration+=1;
}

function beginConversationViewContext(){
  // Conversation Root invalidates every async scroll/window transaction owned by
  // the previous contact before a new store/view is mounted. Old A callbacks may
  // never write into contact B's shared ScrollRoot.
  conversationViewEpoch+=1;
  cancelPendingTailTransaction();
  if(windowRebaseFrame)cancelAnimationFrame(windowRebaseFrame);
  windowRebaseFrame=0;
  loadingOlder=false;
  historyStatus.classList.add('hidden');
  clearUserScrollIntentForExplicitTail();
  programmaticScroll=false;
  lastUserScrollTop=scrollRoot.scrollTop;
  return conversationViewEpoch;
}

function cancelTailRevealOnly(){
  pendingTailToken+=1;
  if(pendingTailFrame)cancelAnimationFrame(pendingTailFrame);
  pendingTailFrame=0;
  pendingTailReason='';
  if(pendingGeometryTailFrame)cancelAnimationFrame(pendingGeometryTailFrame);
  pendingGeometryTailFrame=0;
  pendingGeometryTailReasons.clear();
  tailRevealTargetMessageId='';
}

function claimTailIntent(reason='explicit',{messageId=undefined}={}){
  // ChatViewportPolicy: TAIL and INTERACTION_ANCHOR are mutually exclusive.
  // FOLLOW_TAIL wins because its transaction already owns the viewport. A
  // messageId, when supplied, is part of the same TAIL transaction rather than
  // a second competing anchor transaction.
  clearInteractionGeometryAnchor();
  clearUserScrollIntentForExplicitTail();
  viewport.returnToTail();
  if(messageId!==undefined)tailRevealTargetMessageId=String(messageId||'');
  pendingTailReason=String(reason||'explicit');
  updateScrollFromEndControl();
}

function tailGeometrySignature(){
  return[
    scrollRoot.scrollHeight,
    scrollRoot.clientHeight,
    bottomContainer?.getBoundingClientRect?.().height||0,
    composerFlowReservePx(),
    scrollRoot.dataset.composerPlacement||'sticky',
    KeyboardInsetAdapter?.open?'keyboard-open':'keyboard-closed'
  ].map(value=>String(Math.round(Number(value))||value)).join('|');
}

function messageTurnById(messageId){
  const target=String(messageId||'');
  if(!target)return null;
  for(const node of messageWindow.querySelectorAll('.message-turn[data-id]')){
    if(String(node.dataset.id||'')===target)return node;
  }
  return null;
}

function interactionAnchorVisibleBottomPx(){
  const rootRect=scrollRoot.getBoundingClientRect();
  let bottom=rootRect.bottom;
  if(vv){
    const visualBottom=Math.max(0,Number(vv.offsetTop)||0)+Math.max(1,Number(vv.height)||0);
    bottom=Math.min(bottom,visualBottom);
  }
  const composerRect=composerShell?.getBoundingClientRect?.();
  if(composerRect&&composerRect.top>rootRect.top&&composerRect.top<bottom){
    bottom=composerRect.top;
  }
  return Math.max(rootRect.top+24,bottom-12);
}

function clearInteractionGeometryAnchor(kind=''){
  if(kind&&interactionGeometryAnchor?.kind!==kind)return false;
  interactionGeometryAnchor=null;
  interactionAnchorGeneration+=1;
  if(pendingInteractionAnchorFrame)cancelAnimationFrame(pendingInteractionAnchorFrame);
  pendingInteractionAnchorFrame=0;
  return true;
}

function interactionAnchorGeometrySignature(anchor,node){
  const rect=node?.getBoundingClientRect?.()||{bottom:0};
  return[
    anchor?.messageId||'',
    rect.bottom||0,
    interactionAnchorVisibleBottomPx(),
    composerShell?.getBoundingClientRect?.().height||0,
    scrollRoot.dataset.composerPlacement||'sticky',
    KeyboardInsetAdapter?.open?'keyboard-open':'keyboard-closed'
  ].map(value=>String(Math.round(Number(value))||value)).join('|');
}

function setInteractionGeometryAnchor(messageId,{kind='interaction'}={}){
  const id=String(messageId||'');
  if(!id)return false;
  // FOLLOW_TAIL has higher priority. Reply/interaction anchors are only for a
  // USER_AWAY viewport; own-send uses the TAIL transaction's target message.
  if(viewport.mode===VIEWPORT_STATES.FOLLOW_TAIL){
    clearInteractionGeometryAnchor();
    return false;
  }
  cancelTailRevealOnly();
  interactionGeometryAnchor={
    messageId:id,
    kind:String(kind||'interaction'),
    generation:++interactionAnchorGeneration,
    stableFrames:0,
    previousSignature:'',
    attempts:0
  };
  scheduleInteractionAnchorGeometryReconcile(`${kind}:set`);
  return true;
}

function reconcileInteractionGeometryAnchor(reason='interaction-anchor'){
  const anchor=interactionGeometryAnchor;
  if(!anchor)return false;
  const node=messageTurnById(anchor.messageId);
  if(!node||!node.isConnected){
    clearInteractionGeometryAnchor(anchor.kind);
    return false;
  }
  const rect=node.getBoundingClientRect();
  const visibleBottom=interactionAnchorVisibleBottomPx();
  const delta=Math.ceil(rect.bottom-visibleBottom);
  if(delta>1){
    // ScrollRoot remains the only writer. USER_AWAY stays USER_AWAY and only
    // the minimum delta needed to keep the chosen message above Composer moves.
    setScrollTop(scrollRoot.scrollTop+delta);
  }
  const signature=interactionAnchorGeometrySignature(anchor,node);
  anchor.attempts+=1;
  anchor.stableFrames=(delta<=1&&signature===anchor.previousSignature)?anchor.stableFrames+1:0;
  anchor.previousSignature=signature;
  if(anchor.stableFrames>=2||anchor.attempts>=30){
    clearInteractionGeometryAnchor(anchor.kind);
    return true;
  }
  return true;
}

function scheduleInteractionAnchorGeometryReconcile(reason='interaction-anchor'){
  if(!interactionGeometryAnchor||viewport.mode===VIEWPORT_STATES.FOLLOW_TAIL)return false;
  if(pendingInteractionAnchorFrame)return true;
  const viewEpoch=conversationViewEpoch;
  const generation=interactionGeometryAnchor.generation;
  pendingInteractionAnchorFrame=requestAnimationFrame(()=>{
    pendingInteractionAnchorFrame=0;
    if(viewEpoch!==conversationViewEpoch)return;
    if(!interactionGeometryAnchor||interactionGeometryAnchor.generation!==generation)return;
    reconcileInteractionGeometryAnchor(reason);
    if(interactionGeometryAnchor&&interactionGeometryAnchor.generation===generation){
      scheduleInteractionAnchorGeometryReconcile(`${reason}:settle`);
    }
  });
  return true;
}

function publishViewportGeometryChange(reason='geometry'){
  // One policy decision per geometry event. TAIL and ANCHOR never both react to
  // the same resize/load/keyboard frame.
  if(viewport.mode===VIEWPORT_STATES.FOLLOW_TAIL){
    return scheduleFollowTailGeometryReconcile(reason);
  }
  if(interactionGeometryAnchor){
    return scheduleInteractionAnchorGeometryReconcile(reason);
  }
  return false;
}

function scheduleFollowTailGeometryReconcile(reason='geometry'){
  // Geometry observers publish intent only. ScrollRoot/scrollToTail remains the
  // sole programmatic scroll writer. This covers late image decode, file-meta
  // wrapping, audio hydration and Composer/keyboard obstruction changes.
  if(viewport.mode!==VIEWPORT_STATES.FOLLOW_TAIL)return false;
  pendingGeometryTailReasons.add(String(reason||'geometry'));
  if(pendingGeometryTailFrame)return true;
  const viewEpoch=conversationViewEpoch;
  pendingGeometryTailFrame=requestAnimationFrame(()=>{
    pendingGeometryTailFrame=0;
    if(viewEpoch!==conversationViewEpoch){
      pendingGeometryTailReasons.clear();
      return;
    }
    if(viewport.mode!==VIEWPORT_STATES.FOLLOW_TAIL||hasUserScrollIntent()){
      pendingGeometryTailReasons.clear();
      return;
    }
    const reasons=Array.from(pendingGeometryTailReasons).slice(0,3).join('+')||'geometry';
    pendingGeometryTailReasons.clear();
    scrollToTail(`geometry:${reasons}`);
  });
  return true;
}

function scrollToTail(reason='explicit',{messageId=undefined}={}){
  // ScrollRoot is the ONE tail writer. A send/render/composer shrink can settle
  // over more than two animation frames (especially Safari mobile/PWA). Do not
  // guess a fixed frame count: converge until both geometry and tail distance
  // are stable, with a small bounded safety limit.
  claimTailIntent(reason,{messageId});
  const token=++pendingTailToken;
  const viewEpoch=conversationViewEpoch;
  let stableFrames=0;
  let previousSignature='';
  let attempts=0;
  const maxAttempts=30;

  if(pendingTailFrame)cancelAnimationFrame(pendingTailFrame);

  const settle=()=>{
    if(token!==pendingTailToken||viewEpoch!==conversationViewEpoch)return;

    // A real wheel/touch/drag after the command always wins over auto-follow.
    if(hasUserScrollIntent()){
      pendingTailFrame=0;
      pendingTailReason='';
      updateScrollFromEndControl();
      return;
    }

    attempts+=1;
    let targetScrollTop=scrollRoot.scrollHeight-scrollRoot.clientHeight;
    if(tailRevealTargetMessageId){
      const targetNode=messageTurnById(tailRevealTargetMessageId);
      if(targetNode?.isConnected){
        const targetRect=targetNode.getBoundingClientRect();
        const visibleBottom=interactionAnchorVisibleBottomPx();
        targetScrollTop=Math.max(
          targetScrollTop,
          scrollRoot.scrollTop+Math.max(0,Math.ceil(targetRect.bottom-visibleBottom))
        );
      }
    }
    setScrollTop(targetScrollTop);

    pendingTailFrame=requestAnimationFrame(()=>{
      if(token!==pendingTailToken||viewEpoch!==conversationViewEpoch)return;
      const signature=tailGeometrySignature();
      const atTail=distanceFromTail()<=1;
      stableFrames=(atTail&&signature===previousSignature)?stableFrames+1:0;
      previousSignature=signature;

      if((atTail&&stableFrames>=3)||attempts>=maxAttempts){
        pendingTailFrame=0;
        // Capture the final browser-clamped value before releasing ownership.
        lastUserScrollTop=scrollRoot.scrollTop;
        pendingTailReason='';
        updateScrollFromEndControl();
        return;
      }

      pendingTailFrame=requestAnimationFrame(settle);
    });
  };

  pendingTailFrame=requestAnimationFrame(settle);
}

function firstVisibleAnchor(){
  const rootRect=scrollRoot.getBoundingClientRect();

  for(const node of messageWindow.children){
    const rect=node.getBoundingClientRect();

    if(rect.bottom>rootRect.top+8){
      return{
        id:node.dataset.id,
        renderKey:node.dataset.renderKey||'',
        offset:rect.top-rootRect.top
      };
    }
  }

  return null;
}

function restoreAnchor(anchor){
  if(!anchor)return;

  const byKey=anchor.renderKey
    ?messageWindow.querySelector(
      `[data-render-key="${CSS.escape(anchor.renderKey)}"]`
    )
    :null;
  const node=byKey||(
    anchor.id
      ?messageWindow.querySelector(
        `[data-id="${CSS.escape(anchor.id)}"]`
      )
      :null
  );
  if(!node)return;

  const rootRect=scrollRoot.getBoundingClientRect();
  const delta=
    node.getBoundingClientRect().top-
    rootRect.top-
    anchor.offset;

  if(Math.abs(delta)>0.5){
    setScrollTop(scrollRoot.scrollTop+delta);
  }
}

const mediaObjectUrls=new Map();
const audioHydrationPromises=new WeakMap();
const AudioPlaybackController={
  currentAudio:null,
  claim(audio){
    if(!audio)return;
    const previous=this.currentAudio;
    this.currentAudio=audio;
    if(previous&&previous!==audio&&!previous.paused){
      try{previous.pause();}catch{}
    }
  },
  release(audio){
    if(this.currentAudio===audio)this.currentAudio=null;
  },
  stopAll({reset=false}={}){
    const current=this.currentAudio;
    this.currentAudio=null;
    if(!current)return;
    try{current.pause();}catch{}
    if(reset){
      try{current.currentTime=0;}catch{}
    }
  }
};
let mediaObjectUrlSweepFrame=0;

function currentMediaAccountId(){
  return window.V21AuthSessionStore?.snapshot?.().account?.id||null;
}

function releaseMediaObjectUrl({accountId,assetId}={}){
  const ownerAccountId=String(accountId||'');
  const id=String(assetId||'');
  if(!ownerAccountId||!id)return false;
  const cacheKey=`${ownerAccountId}::${id}`;
  const url=mediaObjectUrls.get(cacheKey);
  if(!url)return false;
  URL.revokeObjectURL(url);
  mediaObjectUrls.delete(cacheKey);
  return true;
}

function scheduleMediaObjectUrlSweep(){
  if(mediaObjectUrlSweepFrame)return;
  mediaObjectUrlSweepFrame=requestAnimationFrame(()=>{
    mediaObjectUrlSweepFrame=0;
    const liveBlobUrls=new Set();
    for(const node of Array.from(document.querySelectorAll('img,audio,video,source'))){
      const url=String(node.currentSrc||node.getAttribute?.('src')||'');
      if(url.startsWith('blob:'))liveBlobUrls.add(url);
    }
    for(const [cacheKey,url] of Array.from(mediaObjectUrls.entries())){
      if(liveBlobUrls.has(url))continue;
      URL.revokeObjectURL(url);
      mediaObjectUrls.delete(cacheKey);
    }
  });
}

let imageViewerOverlay=null;
let imageViewerImage=null;
let imageViewerMain=null;
let imageViewerFilmstrip=null;
let imageViewerFilters=null;
let imageViewerCounter=null;
let imageViewerMeta=null;
let imageViewerPrev=null;
let imageViewerNext=null;
let imageViewerAllItems=[];
let imageViewerItems=[];
let imageViewerIndex=-1;
let imageViewerFilter='all';
let imageViewerAlbumId=null;
let imageViewerTimeFilter='all';
const IMAGE_VIEWER_FILTERS=[
  {key:'all',label:'Tất cả'},
  {key:'self',label:'A'},
  {key:'remote',label:'B'},
  {key:'album',label:'Album hiện tại'}
];
const IMAGE_VIEWER_TIME_FILTERS=[
  {key:'all',label:'Tất cả thời gian'},
  {key:'today',label:'Hôm nay'},
  {key:'yesterday',label:'Hôm qua'},
  {key:'week',label:'7 ngày qua'},
  {key:'month',label:'Tháng này'}
];
let imageViewerSessionSeq=0;
let imageViewerNavigationSeq=0;
let imageViewerFilmstripScrollFrame=0;
let imageViewerSwipeStartX=0;
let imageViewerReturnFocus=null;
let imageViewerHeaderWasInert=false;
let imageViewerFilterScroll=null;
let imageViewerTimeMenuButton=null;
let imageViewerTimeMenuPanel=null;
const imageViewerOwnedUrls=new Map();

function viewerIconSvg(name){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');
  svg.setAttribute('focusable','false');
  svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor');
  svg.setAttribute('stroke-width','2.25');
  svg.setAttribute('stroke-linecap','round');
  svg.setAttribute('stroke-linejoin','round');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  if(name==='close')path.setAttribute('d','M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5');
  else if(name==='chevron-left')path.setAttribute('d','m14.5 6-6 6 6 6');
  else if(name==='chevron-right')path.setAttribute('d','m9.5 6 6 6-6 6');
  else return svg;
  svg.appendChild(path);
  return svg;
}

function mediaViewerItem(media,previewUrl='',createdAt=Date.now(),context={}){
  if(!media?.assetId)return null;
  return{
    assetId:String(media.assetId),
    accountId:String(media.accountId||currentMediaAccountId()||''),
    previewUrl:String(previewUrl||media.previewUrl||''),
    width:Number(media.width)||null,
    height:Number(media.height)||null,
    createdAt:Number(createdAt)||Date.now(),
    messageId:String(context.messageId||''),
    senderKey:context.senderKey==='self'?'self':'remote'
  };
}

function collectConversationImageAssets(){
  const items=[];
  const seen=new Set();
  const add=(media,previewUrl='',createdAt=Date.now(),context={})=>{
    const item=mediaViewerItem(media,previewUrl,createdAt,context);
    if(!item||seen.has(item.assetId))return;
    seen.add(item.assetId);items.push(item);
  };
  for(const message of store.items){
    const context={messageId:message.id,senderKey:message.sender};
    if(message?.media?.type==='image'){
      add(message.media,localImagePreviewUrls.get(String(message.media.assetId||''))||'',message.createdAt,context);
    }else if(message?.media?.type==='gallery'){
      for(const media of (message.media.items||[])){
        add(media,localImagePreviewUrls.get(String(media.assetId||''))||'',message.createdAt,context);
      }
    }
  }
  return items;
}

function revokeViewerOwnedUrls(){
  for(const url of imageViewerOwnedUrls.values())URL.revokeObjectURL(url);
  imageViewerOwnedUrls.clear();
}

function enterImageViewerMode(){
  setComposerActionMenuOpen(false);
  if(!appShell)return false;
  const lease=InteractionController.enter(InteractionMode.IMAGE_VIEWER,{
    owner:'image-viewer',
    lockBaseUi:true
  });
  if(!lease)return false;
  appShell.dataset.imageViewerMode='true';
  return true;
}

function exitImageViewerMode(){
  if(appShell)delete appShell.dataset.imageViewerMode;
  InteractionController.exit(InteractionMode.IMAGE_VIEWER,{owner:'image-viewer'});
}

function positionImageViewerBelowHeader(){
  if(!imageViewerOverlay)return 0;
  const top=regionTop?Math.max(0,regionTop.getBoundingClientRect().bottom):0;
  const host=document.getElementById('activeScreenSlot')||document.getElementById('chatScreen');
  const rect=host?.getBoundingClientRect?.()||null;
  const viewportWidth=Math.max(0,window.innerWidth||document.documentElement.clientWidth||0);
  const left=rect?Math.max(0,rect.left):0;
  const right=rect?Math.max(0,viewportWidth-rect.right):0;
  imageViewerOverlay.style.setProperty('--image-viewer-top',`${Math.round(top*100)/100}px`);
  imageViewerOverlay.style.setProperty('--image-viewer-left',`${Math.round(left*100)/100}px`);
  imageViewerOverlay.style.setProperty('--image-viewer-right',`${Math.round(right*100)/100}px`);
  return top;
}

function lockAppHeaderForImageViewer(){
  if(!regionTop)return;
  imageViewerHeaderWasInert=regionTop.hasAttribute('inert');
  regionTop.setAttribute('inert','');
  regionTop.dataset.imageViewerInert='true';
}

function unlockAppHeaderForImageViewer(){
  if(!regionTop)return;
  delete regionTop.dataset.imageViewerInert;
  if(!imageViewerHeaderWasInert)regionTop.removeAttribute('inert');
  imageViewerHeaderWasInert=false;
}

function syncOpenImageViewerRegion(){
  if(imageViewerOverlay?.open)positionImageViewerBelowHeader();
}

window.addEventListener('resize',syncOpenImageViewerRegion,{passive:true});
window.visualViewport?.addEventListener('resize',syncOpenImageViewerRegion,{passive:true});
window.visualViewport?.addEventListener('scroll',syncOpenImageViewerRegion,{passive:true});

function closeImageViewer({restoreFocus=true}={}){
  imageViewerSessionSeq+=1;
  imageViewerNavigationSeq+=1;
  if(imageViewerFilmstripScrollFrame){cancelAnimationFrame(imageViewerFilmstripScrollFrame);imageViewerFilmstripScrollFrame=0;}
  revokeViewerOwnedUrls();
  if(imageViewerImage){
    imageViewerImage.removeAttribute('src');
    imageViewerImage.dataset.ready='false';
  }
  imageViewerFilmstrip?.replaceChildren();
  imageViewerFilters?.replaceChildren();
  imageViewerAllItems=[];
  imageViewerItems=[];
  imageViewerIndex=-1;
  imageViewerFilter='all';
  imageViewerAlbumId=null;
  imageViewerTimeFilter='all';
  closeImageViewerTimeMenu();
  if(imageViewerOverlay?.open)imageViewerOverlay.close();
  unlockAppHeaderForImageViewer();
  exitImageViewerMode();
  const returnFocus=imageViewerReturnFocus;
  imageViewerReturnFocus=null;
  if(restoreFocus&&returnFocus?.isConnected&&typeof returnFocus.focus==='function'){
    requestAnimationFrame(()=>returnFocus.focus({preventScroll:true}));
  }
  scheduleMediaObjectUrlSweep();
}

function formatViewerDate(date){
  return date.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'});
}

function formatViewerTime(date){
  return date.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
}

function viewerTimeFilterLabel(key){
  return IMAGE_VIEWER_TIME_FILTERS.find(spec=>spec.key===key)?.label||'Tất cả thời gian';
}

function isViewerItemInTimeScope(item,scope){
  if(!item)return false;
  if(scope==='all')return true;
  const stamp=Number(item.createdAt)||0;
  if(!stamp)return true;
  const date=new Date(stamp);
  const now=new Date();
  const startToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(scope==='today')return date>=startToday;
  if(scope==='yesterday'){
    const startYesterday=new Date(startToday);
    startYesterday.setDate(startYesterday.getDate()-1);
    return date>=startYesterday&&date<startToday;
  }
  if(scope==='week'){
    const startWeek=new Date(startToday);
    startWeek.setDate(startWeek.getDate()-6);
    return date>=startWeek;
  }
  if(scope==='month')return date.getFullYear()===now.getFullYear()&&date.getMonth()===now.getMonth();
  return true;
}

function updateImageViewerTimeMenu(){
  if(!imageViewerTimeMenuPanel||!imageViewerTimeMenuButton)return;
  imageViewerTimeMenuButton.setAttribute('aria-label',`Lọc thời gian: ${viewerTimeFilterLabel(imageViewerTimeFilter)}`);
  imageViewerTimeMenuButton.setAttribute('title',viewerTimeFilterLabel(imageViewerTimeFilter));
  for(const button of Array.from(imageViewerTimeMenuPanel.querySelectorAll('.image-review-menu-item'))){
    const active=button.dataset.timeFilter===imageViewerTimeFilter;
    button.toggleAttribute('aria-current',active);
    if(active)button.setAttribute('aria-current','true');
  }
}

function closeImageViewerTimeMenu(){
  if(imageViewerTimeMenuPanel)imageViewerTimeMenuPanel.hidden=true;
  if(imageViewerTimeMenuButton)imageViewerTimeMenuButton.setAttribute('aria-expanded','false');
}

function toggleImageViewerTimeMenu(force){
  if(!imageViewerTimeMenuPanel||!imageViewerTimeMenuButton)return;
  const open=typeof force==='boolean'?force:Boolean(imageViewerTimeMenuPanel.hidden);
  imageViewerTimeMenuPanel.hidden=!open;
  imageViewerTimeMenuButton.setAttribute('aria-expanded',open?'true':'false');
  if(open)updateImageViewerTimeMenu();
}

function applyCurrentImageViewerFilters({preferAssetId='',behavior='smooth'}={}){
  const currentAssetId=String(preferAssetId||imageViewerItems[imageViewerIndex]?.assetId||'');
  let next=[];
  if(imageViewerFilter==='self')next=imageViewerAllItems.filter(item=>item.senderKey==='self');
  else if(imageViewerFilter==='remote')next=imageViewerAllItems.filter(item=>item.senderKey==='remote');
  else if(imageViewerFilter==='album')next=imageViewerAllItems.filter(item=>item.messageId===imageViewerAlbumId);
  else next=[...imageViewerAllItems];
  next=next.filter(item=>isViewerItemInTimeScope(item,imageViewerTimeFilter));
  if(!next.length&&imageViewerTimeFilter!=='all'){
    imageViewerTimeFilter='all';
    return applyCurrentImageViewerFilters({preferAssetId:currentAssetId,behavior});
  }
  if(!next.length&&imageViewerFilter!=='all'){
    imageViewerFilter='all';
    return applyCurrentImageViewerFilters({preferAssetId:currentAssetId,behavior});
  }
  imageViewerItems=next;
  imageViewerIndex=Math.max(0,next.findIndex(item=>item.assetId===currentAssetId));
  renderImageViewerFilmstrip();
  renderImageViewerFilters();
  hydrateVisibleViewerThumbs();
  return showImageViewerIndex(imageViewerIndex,{behavior});
}

function viewerSourceLabel(item){
  return item?.senderKey==='self'?'A':'B';
}

function viewerMetaLabel(item){
  if(!item)return'';
  const date=new Date(Number(item.createdAt)||Date.now());
  const time=formatViewerTime(date);
  const day=formatViewerDate(date);
  const albumCount=imageViewerAllItems.filter(x=>x.messageId&&x.messageId===item.messageId).length||1;
  return `${viewerSourceLabel(item)} · ${albumCount} ảnh · ${day} · ${time}`;
}

function updateImageViewerFilmstrip({behavior='smooth'}={}){
  if(!imageViewerFilmstrip)return;
  const thumbs=Array.from(imageViewerFilmstrip.children||[]);
  for(const [index,thumb] of thumbs.entries()){
    const active=index===imageViewerIndex;
    thumb.toggleAttribute('aria-current',active);
    if(active)thumb.setAttribute('aria-current','true');
  }
  const active=thumbs[imageViewerIndex];
  active?.scrollIntoView?.({behavior,inline:'center',block:'nearest'});
}

function updateImageViewerFilterChips(){
  if(!imageViewerFilters)return;
  for(const button of Array.from(imageViewerFilters.children||[])){
    const active=button.dataset.filter===imageViewerFilter;
    button.toggleAttribute('aria-current',active);
    if(active)button.setAttribute('aria-current','true');
  }
}

function renderImageViewerFilters(){
  if(!imageViewerFilters)return;
  imageViewerFilters.replaceChildren();
  const chipScroll=document.createElement('div');
  chipScroll.className='image-review-filter-scroll';
  for(const spec of IMAGE_VIEWER_FILTERS){
    const chip=document.createElement('button');
    chip.type='button';
    chip.className='image-review-chip';
    chip.textContent=spec.label;
    chip.dataset.filter=spec.key;
    if(spec.key==='album'&&!imageViewerAlbumId)chip.disabled=true;
    chip.addEventListener('click',event=>{
      event.stopPropagation();
      void applyImageViewerFilter(spec.key,{behavior:'auto'});
    });
    chipScroll.appendChild(chip);
  }
  const tools=document.createElement('div');
  tools.className='image-review-tools';
  const more=document.createElement('button');
  more.type='button';
  more.className='image-review-control image-review-more';
  more.setAttribute('aria-label',`Lọc thời gian: ${viewerTimeFilterLabel(imageViewerTimeFilter)}`);
  more.setAttribute('aria-haspopup','menu');
  more.setAttribute('aria-expanded','false');
  more.textContent='…';
  const menu=document.createElement('div');
  menu.className='image-review-menu';
  menu.hidden=true;
  menu.setAttribute('role','menu');
  const label=document.createElement('div');
  label.className='image-review-menu-label';
  label.textContent='Thời gian';
  menu.appendChild(label);
  for(const spec of IMAGE_VIEWER_TIME_FILTERS){
    const item=document.createElement('button');
    item.type='button';
    item.className='image-review-menu-item';
    item.dataset.timeFilter=spec.key;
    item.setAttribute('role','menuitemradio');
    const text=document.createElement('span');
    text.textContent=spec.label;
    const check=document.createElement('span');
    check.className='image-review-menu-check';
    check.textContent='✓';
    item.append(text,check);
    item.addEventListener('click',event=>{
      event.stopPropagation();
      void applyImageViewerTimeFilter(spec.key,{behavior:'auto'});
      closeImageViewerTimeMenu();
    });
    menu.appendChild(item);
  }
  more.addEventListener('click',event=>{
    event.stopPropagation();
    toggleImageViewerTimeMenu(imageViewerTimeMenuPanel?.hidden!==false);
  });
  tools.append(more,menu);
  imageViewerFilters.append(chipScroll,tools);
  imageViewerFilterScroll=chipScroll;
  imageViewerTimeMenuButton=more;
  imageViewerTimeMenuPanel=menu;
  updateImageViewerFilterChips();
  updateImageViewerTimeMenu();
}

function applyImageViewerFilter(scope,{preferAssetId='',behavior='smooth'}={}){
  imageViewerFilter=['all','self','remote','album'].includes(scope)?scope:'all';
  return applyCurrentImageViewerFilters({preferAssetId,behavior});
}

function applyImageViewerTimeFilter(scope,{preferAssetId='',behavior='smooth'}={}){
  imageViewerTimeFilter=IMAGE_VIEWER_TIME_FILTERS.some(spec=>spec.key===scope)?scope:'all';
  return applyCurrentImageViewerFilters({preferAssetId,behavior});
}

function updateImageViewerChrome(){
  if(!imageViewerItems.length){
    if(imageViewerCounter)imageViewerCounter.textContent='';
    if(imageViewerMeta)imageViewerMeta.textContent='';
    return;
  }
  if(imageViewerCounter)imageViewerCounter.textContent=`Ảnh ${imageViewerIndex+1} / ${imageViewerItems.length}`;
  if(imageViewerMeta)imageViewerMeta.textContent=viewerMetaLabel(imageViewerItems[imageViewerIndex]);
  if(imageViewerPrev)imageViewerPrev.hidden=imageViewerIndex<=0;
  if(imageViewerNext)imageViewerNext.hidden=imageViewerIndex>=imageViewerItems.length-1;
  updateImageViewerFilmstrip();
  updateImageViewerFilterChips();
}

function ensureImageViewer(){
  if(imageViewerOverlay)return imageViewerOverlay;
  const overlay=document.createElement('dialog');
  overlay.className='image-viewer-overlay';
  overlay.setAttribute('aria-label','Xem lại ảnh');

  const review=document.createElement('div');
  review.className='image-review';

  const head=document.createElement('div');
  head.className='image-review-head';

  const heading=document.createElement('div');
  heading.className='image-review-heading';
  const title=document.createElement('div');
  title.className='image-review-title';
  title.textContent='Xem lại ảnh';
  const counter=document.createElement('div');
  counter.className='image-review-count';
  heading.append(title,counter);

  const close=document.createElement('button');
  close.type='button';
  close.className='image-review-control image-review-close';
  close.setAttribute('aria-label','Đóng ảnh');
  close.appendChild(viewerIconSvg('close'));
  head.append(heading,close);

  const main=document.createElement('div');
  main.className='image-review-main';

  const image=document.createElement('img');
  image.className='image-review-image';
  image.alt='Ảnh';
  image.draggable=false;

  const prev=document.createElement('button');
  prev.type='button';
  prev.className='image-review-control image-review-nav image-review-prev';
  prev.setAttribute('aria-label','Ảnh trước');
  prev.appendChild(viewerIconSvg('chevron-left'));

  const next=document.createElement('button');
  next.type='button';
  next.className='image-review-control image-review-nav image-review-next';
  next.setAttribute('aria-label','Ảnh sau');
  next.appendChild(viewerIconSvg('chevron-right'));

  const meta=document.createElement('div');
  meta.className='image-review-meta';
  main.append(image,prev,next,meta);

  const bottom=document.createElement('div');
  bottom.className='image-review-bottom';
  const filters=document.createElement('div');
  filters.className='image-review-filters';
  filters.setAttribute('aria-label','Lọc ảnh theo nguồn, album và thời gian');
  const thumbs=document.createElement('div');
  thumbs.className='image-review-thumbs';
  thumbs.setAttribute('aria-label','Ảnh trong cuộc trò chuyện');
  bottom.append(filters,thumbs);

  close.addEventListener('click',event=>{event.stopPropagation();closeImageViewer();});
  prev.addEventListener('click',event=>{event.stopPropagation();void showImageViewerIndex(imageViewerIndex-1);});
  next.addEventListener('click',event=>{event.stopPropagation();void showImageViewerIndex(imageViewerIndex+1);});
  overlay.addEventListener('cancel',event=>{event.preventDefault();closeImageViewer();});
  overlay.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();closeImageViewer();}
    else if(event.key==='ArrowLeft'){event.preventDefault();void showImageViewerIndex(imageViewerIndex-1);}
    else if(event.key==='ArrowRight'){event.preventDefault();void showImageViewerIndex(imageViewerIndex+1);}
  });
  main.addEventListener('touchstart',event=>{
    imageViewerSwipeStartX=event.changedTouches?.[0]?.screenX||0;
  },{passive:true});
  main.addEventListener('touchend',event=>{
    const endX=event.changedTouches?.[0]?.screenX||0;
    const dx=endX-imageViewerSwipeStartX;
    if(Math.abs(dx)>45)void showImageViewerIndex(imageViewerIndex+(dx<0?1:-1));
  },{passive:true});
  thumbs.addEventListener('scroll',()=>{
    if(imageViewerFilmstripScrollFrame)return;
    imageViewerFilmstripScrollFrame=requestAnimationFrame(()=>{
      imageViewerFilmstripScrollFrame=0;
      hydrateVisibleViewerThumbs();
    });
  },{passive:true});
  overlay.addEventListener('click',event=>{
    if(imageViewerTimeMenuPanel?.hidden)return;
    if(event.target===imageViewerTimeMenuPanel||imageViewerTimeMenuPanel.contains(event.target)||event.target===imageViewerTimeMenuButton)return;
    closeImageViewerTimeMenu();
  });

  review.append(head,main,bottom);
  overlay.appendChild(review);
  if(!globalOverlayRoot)throw new Error('ImageViewer invariant: globalOverlayRoot missing');
  globalOverlayRoot.appendChild(overlay);
  imageViewerOverlay=overlay;
  imageViewerImage=image;
  imageViewerMain=main;
  imageViewerFilmstrip=thumbs;
  imageViewerFilters=filters;
  imageViewerCounter=counter;
  imageViewerMeta=meta;
  imageViewerPrev=prev;
  imageViewerNext=next;
  return overlay;
}

async function loadViewerAssetSource(item){
  if(!item)return{src:'',owned:false};
  if(item.previewUrl)return{src:item.previewUrl,owned:false};
  const accountId=String(item.accountId||currentMediaAccountId()||'');
  const assetId=String(item.assetId||'');
  if(!accountId||!assetId||accountId!==String(currentMediaAccountId()||''))return{src:'',owned:false};
  let row=await window.V21MediaCache?.get?.({accountId,assetId});
  if(!(row?.blob instanceof Blob)){
    row=await window.V21SyncEngine?.ensureMediaRemote?.({accountId,assetId})||row;
  }
  if(accountId!==String(currentMediaAccountId()||'')||!(row?.blob instanceof Blob))return{src:'',owned:false};
  return{src:URL.createObjectURL(row.blob),owned:true};
}

function renderImageViewerFilmstrip(){
  if(!imageViewerFilmstrip)return;
  imageViewerFilmstrip.replaceChildren();
  imageViewerFilmstrip.hidden=imageViewerItems.length<=1;
  imageViewerItems.forEach((item,index)=>{
    const thumb=document.createElement('button');
    thumb.type='button';
    thumb.className='image-review-thumb';
    thumb.dataset.viewerIndex=String(index);
    thumb.setAttribute('aria-label',`Xem ảnh ${index+1}`);
    const img=document.createElement('img');
    img.className='image-review-thumb-image';
    img.alt='';
    img.draggable=false;
    img.dataset.assetId=String(item.assetId||'');
    thumb.appendChild(img);
    thumb.addEventListener('click',event=>{event.stopPropagation();void showImageViewerIndex(index);});
    imageViewerFilmstrip.appendChild(thumb);
  });
}

async function hydrateViewerThumb(index){
  const item=imageViewerItems[index];
  const thumb=imageViewerFilmstrip?.children?.[index];
  const img=thumb?.querySelector?.('.image-review-thumb-image');
  if(!item||!img||img.dataset.ready==='true')return false;
  const sessionId=imageViewerSessionSeq;
  const source=await loadViewerAssetSource(item);
  if(sessionId!==imageViewerSessionSeq||!imageViewerOverlay?.open){
    if(source.owned&&source.src)URL.revokeObjectURL(source.src);
    return false;
  }
  if(!source.src)return false;
  if(source.owned){
    const key=`thumb:${item.assetId}`;
    const previous=imageViewerOwnedUrls.get(key);
    if(previous&&previous!==source.src)URL.revokeObjectURL(previous);
    imageViewerOwnedUrls.set(key,source.src);
  }
  img.src=source.src;
  img.dataset.ready='true';
  return true;
}

function hydrateVisibleViewerThumbs(){
  if(!imageViewerFilmstrip||imageViewerFilmstrip.hidden)return;
  const root=imageViewerFilmstrip.getBoundingClientRect();
  const margin=72;
  for(const [index,thumb] of Array.from(imageViewerFilmstrip.children||[]).entries()){
    const rect=thumb.getBoundingClientRect();
    if(rect.right>=root.left-margin&&rect.left<=root.right+margin)void hydrateViewerThumb(index);
  }
}

async function primeViewerNeighbor(index){
  if(index<0||index>=imageViewerItems.length)return false;
  const item=imageViewerItems[index];
  if(!item||item.previewUrl)return true;
  const accountId=String(item.accountId||currentMediaAccountId()||'');
  const assetId=String(item.assetId||'');
  if(!accountId||!assetId||accountId!==String(currentMediaAccountId()||''))return false;
  let row=await window.V21MediaCache?.get?.({accountId,assetId});
  if(!(row?.blob instanceof Blob)){
    row=await window.V21SyncEngine?.ensureMediaRemote?.({accountId,assetId})||row;
  }
  return accountId===String(currentMediaAccountId()||'')&&row?.blob instanceof Blob;
}

function preloadViewerNeighbors(){
  for(const index of [imageViewerIndex-1,imageViewerIndex+1])void primeViewerNeighbor(index);
}

async function showImageViewerIndex(index,{behavior='smooth'}={}){
  if(!imageViewerItems.length||!imageViewerImage)return false;
  const nextIndex=Math.max(0,Math.min(imageViewerItems.length-1,Number(index)||0));
  const navId=++imageViewerNavigationSeq;
  imageViewerIndex=nextIndex;
  updateImageViewerChrome();
  const item=imageViewerItems[nextIndex];
  const source=await loadViewerAssetSource(item);
  if(navId!==imageViewerNavigationSeq||!imageViewerOverlay?.open){
    if(source.owned&&source.src)URL.revokeObjectURL(source.src);
    return false;
  }
  if(!source.src){
    imageViewerImage.removeAttribute('src');
    imageViewerImage.dataset.ready='false';
    if(imageViewerMeta)imageViewerMeta.textContent='Không tải được ảnh';
    return false;
  }
  const previous=imageViewerOwnedUrls.get('active');
  if(previous&&previous!==source.src)URL.revokeObjectURL(previous);
  imageViewerOwnedUrls.delete('active');
  if(source.owned)imageViewerOwnedUrls.set('active',source.src);
  imageViewerImage.src=source.src;
  imageViewerImage.dataset.ready='true';
  preloadViewerNeighbors();
  updateImageViewerFilmstrip({behavior});
  hydrateVisibleViewerThumbs();
  return true;
}

async function openImageViewer({assetId,accountId=currentMediaAccountId(),previewUrl='',messageId=''}={}){
  ensureImageViewer();
  const id=String(assetId||'');
  const items=collectConversationImageAssets();
  const existingIndex=items.findIndex(item=>item.assetId===id);
  if(existingIndex>=0&&previewUrl)items[existingIndex]={...items[existingIndex],previewUrl:String(previewUrl)};
  else if(id&&existingIndex<0){
    items.push({
      assetId:id,
      accountId:String(accountId||''),
      previewUrl:String(previewUrl||''),
      createdAt:Date.now(),
      messageId:String(messageId||''),
      senderKey:'self'
    });
  }
  imageViewerSessionSeq+=1;
  imageViewerNavigationSeq+=1;
  revokeViewerOwnedUrls();
  imageViewerAllItems=items;
  const clicked=items.find(item=>item.assetId===id)||null;
  imageViewerAlbumId=clicked?.messageId||null;
  imageViewerFilter=imageViewerAlbumId?'album':'all';
  imageViewerTimeFilter='all';
  if(!imageViewerOverlay.open){
    imageViewerReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    if(!enterImageViewerMode()){
      imageViewerReturnFocus=null;
      return false;
    }
    positionImageViewerBelowHeader();
    lockAppHeaderForImageViewer();
    try{
      if(typeof imageViewerOverlay.showModal==='function')imageViewerOverlay.showModal();
      else imageViewerOverlay.show();
    }catch(error){
      unlockAppHeaderForImageViewer();
      exitImageViewerMode();
      throw error;
    }
    requestAnimationFrame(()=>imageViewerOverlay.querySelector('.image-review-close')?.focus({preventScroll:true}));
  }else{
    positionImageViewerBelowHeader();
  }
  return applyImageViewerFilter(imageViewerFilter,{preferAssetId:id,behavior:'auto'});
}

async function hydrateImageElement(img,media){
  const accountId=String(media?.accountId||currentMediaAccountId()||'');
  const assetId=String(media?.assetId||'');
  if(!accountId||!assetId||!img)return false;
  if(accountId!==String(currentMediaAccountId()||''))return false;

  const cacheKey=`${accountId}::${assetId}`;
  const hydrateKey=`${cacheKey}::${String(img.dataset.mediaHydrateSeq||'0')}`;
  img.dataset.mediaHydrateKey=hydrateKey;

  const applyUrl=url=>{
    if(!url)return false;
    if(img.dataset.mediaHydrateKey!==hydrateKey)return false;
    if(accountId!==String(currentMediaAccountId()||''))return false;
    // A new keyed message node is hydrated while still detached, then inserted
    // into MessageWindow later in the same render transaction. Setting src on a
    // detached <img> is valid and is required for the sender's warm local Blob
    // URL path. Requiring isConnected here made optimistic sender images blank
    // while receiver images (async hydration) happened to work.
    img.src=url;
    img.dataset.ready='true';
    return true;
  };

  const warmUrl=mediaObjectUrls.get(cacheKey);
  if(warmUrl)return applyUrl(warmUrl);

  let row=await window.V21MediaCache?.get?.({accountId,assetId});
  if(!(row?.blob instanceof Blob)){
    // Renderer asks for a missing Blob, but SyncEngine remains the only owner
    // allowed to touch remote Storage. This completes historical/snapshot media
    // hydration without making Realtime or Renderer own the network path.
    row=await window.V21SyncEngine?.ensureMediaRemote?.({accountId,assetId})||row;
  }
  if(!(row?.blob instanceof Blob))return false;
  if(img.dataset.mediaHydrateKey!==hydrateKey||accountId!==String(currentMediaAccountId()||''))return false;

  let url=mediaObjectUrls.get(cacheKey);
  if(!url){url=URL.createObjectURL(row.blob);mediaObjectUrls.set(cacheKey,url);}
  return applyUrl(url);
}

function imageAspectRatio(media){
  const ratio=Number(media?.aspectRatio)||(Number(media?.width)>0&&Number(media?.height)>0?Number(media.width)/Number(media.height):1.5);
  return Math.max(.22,Math.min(4.5,ratio||1.5));
}

function singleImageDisplayWidth(media){
  const ratio=imageAspectRatio(media);
  return Math.round(Math.max(150,Math.min(360,ratio*420)));
}

function stableMessageDomKey(message){
  const identity=String(message?.clientId||message?.id||'');
  return `${message?.sender==='self'?'self':'remote'}:${identity}`;
}

function mediaVisualSignature(media){
  if(!media)return 'none';
  if(String(media.type)==='image'){
    return [
      'image',
      String(media.assetId||''),
      String(imageAspectRatio(media)),
      String(singleImageDisplayWidth(media))
    ].join('|');
  }
  if(String(media.type)==='gallery'){
    const items=Array.isArray(media?.items)?media.items.filter(Boolean):[];
    return `gallery|${items.map(item=>[
      String(item.assetId||''),
      String(imageAspectRatio(item))
    ].join('@')).join(',')}`;
  }
  if(String(media.type)==='file'){
    return [
      'file',
      String(media.kind||'file'),
      String(media.name||''),
      String(media.displayName||''),
      String(media.durationSeconds||'')
    ].join('|');
  }
  return String(media.type||media.kind||'media');
}

function messageVisualSignature(message){
  const reply=message?.replyTo
    ?[
      String(message.replyTo.id||''),
      String(message.replyTo.sender||''),
      String(message.replyTo.text||'')
    ].join('|')
    :'';
  return JSON.stringify([
    String(message?.sender||'remote'),
    String(message?.kind||'text'),
    String(message?.text||''),
    message?.important?'1':'0',
    reply,
    mediaVisualSignature(message?.media)
  ]);
}

function setImageTileOverlay(wrap,overlayText=''){
  let overlay=wrap.querySelector('[data-media-overlay="true"]');
  const value=String(overlayText||'');
  if(!value){
    overlay?.remove();
    return;
  }
  if(!overlay){
    overlay=document.createElement('span');
    overlay.dataset.mediaOverlay='true';
    overlay.className='absolute inset-0 flex items-center justify-center bg-black/45 text-xl font-semibold text-white';
    wrap.appendChild(overlay);
  }
  if(overlay.textContent!==value)overlay.textContent=value;
}

function patchImageTileNode(wrap,media,{viewerContext={},overlayText=null}={}){
  if(!wrap||!media)return wrap;
  const assetId=String(media.assetId||'');
  const accountId=String(media.accountId||currentMediaAccountId()||'');
  wrap.dataset.mediaAssetId=assetId;
  wrap.dataset.mediaAccountId=accountId;
  wrap.dataset.viewerMessageId=String(viewerContext.messageId||'');
  wrap.dataset.viewerSender=String(viewerContext.senderKey||'remote');
  wrap.dataset.viewerCreatedAt=String(viewerContext.createdAt||'');
  if(wrap.__viewerContext){
    wrap.__viewerContext.messageId=String(viewerContext.messageId||'');
    wrap.__viewerContext.senderKey=String(viewerContext.senderKey||'remote');
    wrap.__viewerContext.createdAt=viewerContext.createdAt||'';
  }
  if(wrap.dataset.galleryTile!=='true'){
    wrap.style.aspectRatio=String(imageAspectRatio(media));
  }

  const img=wrap.querySelector('img');
  const localPreview=localImagePreviewUrls.get(assetId);
  if(img){
    if(localPreview&&!img.dataset.ready){
      img.src=localPreview;
      img.loading='eager';
      img.dataset.ready='true';
      wrap.dataset.ready='true';
      wrap.dataset.localPreview='true';
      wrap.classList.remove('bg-slate-200');
      wrap.style.background='transparent';
    }else if(!localPreview&&!img.getAttribute('src')){
      void hydrateImageElement(img,{assetId,accountId});
    }
  }
  if(overlayText!==null)setImageTileOverlay(wrap,overlayText);
  return wrap;
}

function createImageTile(media,{className='block h-full w-full object-contain',overlayText='',viewerContext={}}={}){
  const wrap=document.createElement('div');
  const ratio=imageAspectRatio(media);
  wrap.className='media-image-tile relative overflow-hidden bg-slate-200';
  wrap.dataset.ready='false';
  wrap.style.aspectRatio=String(ratio);
  wrap.dataset.mediaAssetId=String(media.assetId||'');
  wrap.dataset.mediaAccountId=String(media.accountId||currentMediaAccountId()||'');
  wrap.dataset.viewerMessageId=String(viewerContext.messageId||'');
  wrap.dataset.viewerSender=String(viewerContext.senderKey||'remote');
  wrap.dataset.viewerCreatedAt=String(viewerContext.createdAt||'');
  wrap.__viewerContext=viewerContext;

  const img=document.createElement('img');
  // The tile wrapper already exposes aria-label="Xem ảnh". Keep img alt empty
  // so a transient/broken local Blob URL can never leak the literal "Ảnh"
  // into the sender bubble.
  img.alt='';
  img.draggable=false;
  img.decoding='async';
  const localPreview=localImagePreviewUrls.get(String(media.assetId||''));
  img.loading=localPreview?'eager':'lazy';
  img.className=className;
  img.dataset.ready='false';
  if(localPreview){
    img.src=localPreview;
    img.dataset.ready='true';
    wrap.dataset.ready='true';
    wrap.dataset.localPreview='true';
    wrap.classList.remove('bg-slate-200');
    wrap.style.background='transparent';
  }
  wrap.appendChild(img);
  img.addEventListener('load',()=>{
    img.dataset.ready='true';
    img.dataset.retryCount='0';
    wrap.dataset.ready='true';
    wrap.classList.remove('bg-slate-200');
    wrap.style.background='transparent';
    publishViewportGeometryChange('image-load');
  });
  img.addEventListener('error',()=>{
    img.dataset.ready='false';
    wrap.dataset.ready='false';
    wrap.classList.add('bg-slate-200');
    wrap.style.background='';
    const ownerAccountId=String(wrap.dataset.mediaAccountId||currentMediaAccountId()||'');
    const ownerAssetId=String(wrap.dataset.mediaAssetId||'');
    const badSrc=String(img.getAttribute('src')||'');
    if(badSrc.startsWith('blob:')){
      const cacheKey=`${ownerAccountId}::${ownerAssetId}`;
      if(mediaObjectUrls.get(cacheKey)===badSrc)releaseMediaObjectUrl({accountId:ownerAccountId,assetId:ownerAssetId});
    }
    img.removeAttribute('src');
    const retries=Number(img.dataset.retryCount||0);
    if(retries>=2)return;
    img.dataset.retryCount=String(retries+1);
    requestAnimationFrame(()=>{
      if(!img.isConnected)return;
      void hydrateImageElement(img,{assetId:ownerAssetId,accountId:ownerAccountId});
    });
  });
  if(!localPreview)void hydrateImageElement(img,{...media,accountId:String(media.accountId||currentMediaAccountId()||'')});

  setImageTileOverlay(wrap,overlayText);

  wrap.setAttribute('role','button');
  wrap.tabIndex=0;
  wrap.setAttribute('aria-label','Xem ảnh');
  const open=()=>{
    const viewerPreview=img.currentSrc||img.src||localPreview||'';
    void openImageViewer({
      assetId:String(wrap.dataset.mediaAssetId||''),
      previewUrl:viewerPreview,
      messageId:String(viewerContext.messageId||wrap.dataset.viewerMessageId||'')
    });
  };
  wrap.addEventListener('click',open);
  wrap.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}
  });
  return wrap;
}

function applyImageGalleryGeometry(grid,count){
  grid.dataset.layout=count===3?'three':count===4?'four':'multi';
  grid.setAttribute('data-gallery-count',String(count));
  grid.style.cssText='display:grid;width:360px;max-width:100%;gap:4px;overflow:hidden;border-radius:14px;';
  if(count===2){
    grid.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';
    grid.style.gridTemplateRows='';
    grid.style.aspectRatio='1.7';
  }else if(count===3){
    grid.style.gridTemplateColumns='minmax(0,1.55fr) minmax(0,1fr)';
    grid.style.gridTemplateRows='repeat(2,minmax(0,1fr))';
    grid.style.aspectRatio='1.32';
  }else{
    grid.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';
    grid.style.gridTemplateRows='repeat(2,minmax(0,1fr))';
    grid.style.aspectRatio='1.2';
  }
}

function patchImageGalleryNode(grid,media,{message=null}={}){
  const items=Array.isArray(media?.items)?media.items.filter(Boolean):[];
  if(!grid||!items.length)return grid;
  grid.dataset.albumId=String(message?.id||'');
  grid.classList.toggle('mt-2',Boolean(message?.text||message?.replyTo));
  applyImageGalleryGeometry(grid,items.length);

  const existing=new Map();
  for(const child of Array.from(grid.children)){
    const assetId=String(child.dataset?.mediaAssetId||'');
    if(assetId)existing.set(assetId,child);
  }

  const visible=items.slice(0,4);
  const desired=[];
  visible.forEach((item,index)=>{
    const assetId=String(item.assetId||'');
    const remaining=index===3?items.length-4:0;
    let tile=existing.get(assetId)||null;
    if(tile){
      existing.delete(assetId);
      patchImageTileNode(tile,item,{
        overlayText:remaining>0?`+${remaining}`:'',
        viewerContext:{
          messageId:message?.id||'',
          senderKey:message?.sender||'remote',
          createdAt:message?.createdAt||Date.now()
        }
      });
    }else{
      tile=createImageTile(item,{
        className:'block h-full w-full object-cover',
        overlayText:remaining>0?`+${remaining}`:'',
        viewerContext:{
          messageId:message?.id||'',
          senderKey:message?.sender||'remote',
          createdAt:message?.createdAt||Date.now()
        }
      });
      tile.dataset.galleryTile='true';
    }
    tile.dataset.galleryTile='true';
    tile.style.aspectRatio='auto';
    tile.style.minHeight='0';
    tile.style.height='100%';
    tile.style.gridRow=items.length===3&&index===0?'span 2':'auto';
    desired.push(tile);
  });

  for(const stale of existing.values())stale.remove();

  let cursor=grid.firstElementChild;
  for(const tile of desired){
    if(tile===cursor){
      cursor=cursor.nextElementSibling;
    }else{
      grid.insertBefore(tile,cursor);
    }
  }
  return grid;
}

function createImageGalleryNode(media,{message=null}={}){
  const items=Array.isArray(media?.items)?media.items.filter(Boolean):[];
  if(!items.length)return null;
  const grid=document.createElement('div');
  grid.className='media-gallery-grid';
  if(message?.text||message?.replyTo)grid.classList.add('mt-2');
  grid.dataset.layout=items.length===3?'three':items.length===4?'four':'multi';
  grid.dataset.albumId=String(message?.id||'');
  grid.dataset.messageMediaRoot='true';
  grid.dataset.mediaRootKind='gallery';
  grid.setAttribute('data-gallery-count',String(items.length));
  grid.style.cssText='display:grid;width:360px;max-width:100%;gap:4px;overflow:hidden;border-radius:14px;';
  if(items.length===2){
    grid.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';
    grid.style.aspectRatio='1.7';
  }else if(items.length===3){
    grid.style.gridTemplateColumns='minmax(0,1.55fr) minmax(0,1fr)';
    grid.style.gridTemplateRows='repeat(2,minmax(0,1fr))';
    grid.style.aspectRatio='1.32';
  }else{
    grid.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';
    grid.style.gridTemplateRows='repeat(2,minmax(0,1fr))';
    grid.style.aspectRatio='1.2';
  }
  const visible=items.slice(0,4);
  visible.forEach((item,index)=>{
    const remaining=index===3?items.length-4:0;
    const tile=createImageTile(item,{
      className:'block h-full w-full object-cover',
      overlayText:remaining>0?`+${remaining}`:'',
      viewerContext:{
        messageId:message?.id||'',
        senderKey:message?.sender||'remote',
        createdAt:message?.createdAt||Date.now()
      }
    });
    tile.dataset.galleryTile='true';
    tile.style.aspectRatio='auto';
    tile.style.minHeight='0';
    tile.style.height='100%';
    if(items.length===3&&index===0)tile.style.gridRow='span 2';
    if(items.length===4)tile.style.gridRow='auto';
    grid.appendChild(tile);
  });
  return grid;
}

function applyAudioElementSource(audio,url){
  const src=String(url||'');
  if(!audio||!src)return false;
  const current=String(audio.getAttribute('src')||audio.currentSrc||'');
  if(current!==src){
    audio.src=src;
    try{audio.load?.();}catch{}
  }
  audio.dataset.ready='true';
  return true;
}

function primeAudioElementFromMemory(audio,media){
  const accountId=String(media?.accountId||currentMediaAccountId()||'');
  const assetId=String(media?.assetId||'');
  if(!audio||!accountId||!assetId||accountId!==String(currentMediaAccountId()||''))return false;
  if(audio.getAttribute('src')){
    audio.dataset.ready='true';
    return true;
  }
  const cacheKey=`${accountId}::${assetId}`;
  const warmUrl=mediaObjectUrls.get(cacheKey)||localAudioPreviewUrls?.get?.(assetId)||'';
  if(!warmUrl)return false;
  return applyAudioElementSource(audio,warmUrl);
}

async function hydrateAudioElement(audio,media){
  const accountId=String(media?.accountId||currentMediaAccountId()||'');
  const assetId=String(media?.assetId||'');
  if(!audio||!accountId||!assetId||accountId!==String(currentMediaAccountId()||''))return false;
  if(primeAudioElementFromMemory(audio,{accountId,assetId}))return true;
  const cacheKey=`${accountId}::${assetId}`;
  let row=await window.V21MediaCache?.get?.({accountId,assetId});
  if(!(row?.blob instanceof Blob)){
    row=await window.V21SyncEngine?.ensureMediaRemote?.({accountId,assetId});
  }
  if(!(row?.blob instanceof Blob)||accountId!==String(currentMediaAccountId()||''))return false;
  let url=mediaObjectUrls.get(cacheKey);
  if(!url){url=URL.createObjectURL(row.blob);mediaObjectUrls.set(cacheKey,url);}
  return applyAudioElementSource(audio,url);
}

function ensureAudioElementReady(audio,media){
  if(primeAudioElementFromMemory(audio,media))return Promise.resolve(true);
  const existing=audioHydrationPromises.get(audio);
  if(existing)return existing;
  const pending=hydrateAudioElement(audio,media)
    .catch(()=>false)
    .finally(()=>{
      if(audioHydrationPromises.get(audio)===pending)audioHydrationPromises.delete(audio);
    });
  audioHydrationPromises.set(audio,pending);
  return pending;
}

function audioPlaybackButton(node,button){
  return button||node?.querySelector?.('[data-audio-play]')||null;
}

async function toggleAudioPlayback(node,audio,media,{button=null}={}){
  if(!audio)return false;
  const control=audioPlaybackButton(node,button);
  if(!audio.paused){
    audio.pause();
    return true;
  }

  if(primeAudioElementFromMemory(audio,media)){
    AudioPlaybackController.claim(audio);
    try{
      await audio.play();
      return true;
    }catch(error){
      AudioPlaybackController.release(audio);
      console.warn('[V21 audio playback]',error);
      return false;
    }
  }

  if(node)node.dataset.audioPlaybackState='loading';
  if(control){
    control.disabled=true;
    control.textContent='…';
    control.setAttribute('aria-label','Đang tải ghi âm');
  }
  const ready=await ensureAudioElementReady(audio,media);
  if(node)delete node.dataset.audioPlaybackState;
  if(control){
    control.disabled=false;
    control.textContent='▶';
    control.setAttribute('aria-label','Phát ghi âm');
  }
  if(!ready)return false;

  AudioPlaybackController.claim(audio);
  try{
    await audio.play();
    return true;
  }catch(error){
    AudioPlaybackController.release(audio);
    console.warn('[V21 audio playback after hydrate]',error);
    return false;
  }
}

function bindAudioMiniPlayer(node,audio){
  if(!node||!audio||audio.dataset.miniPlayerBound==='true')return;
  audio.dataset.miniPlayerBound='true';
  const play=node.querySelector('[data-audio-play]');
  const progress=node.querySelector('[data-audio-progress]');
  const fill=node.querySelector('[data-audio-progress-fill]');
  const time=node.querySelector('[data-audio-time]');

  const knownTotal=()=>{
    const native=Number(audio.duration);
    if(Number.isFinite(native)&&native>0)return native;
    return Math.max(0,Number(node.dataset.audioDurationSeconds)||0);
  };
  const update=()=>{
    const total=knownTotal();
    const current=Math.max(0,Number(audio.currentTime)||0);
    if(fill)fill.style.width=`${total>0?Math.min(100,(current/total)*100):0}%`;
    if(time)time.textContent=`${formatAudioClock(current)} / ${formatAudioClock(total)}`;
    if(progress){
      progress.setAttribute('aria-valuemin','0');
      progress.setAttribute('aria-valuemax',String(Math.max(0,Math.floor(total))));
      progress.setAttribute('aria-valuenow',String(Math.max(0,Math.floor(current))));
    }
  };

  play?.addEventListener('click',()=>{
    void toggleAudioPlayback(node,audio,{
      accountId:node.dataset.mediaAccountId,
      assetId:node.dataset.mediaAudioAssetId
    },{button:play});
  });
  progress?.addEventListener('click',event=>{
    const total=knownTotal();
    if(!(total>0))return;
    const rect=progress.getBoundingClientRect();
    const ratio=Math.min(1,Math.max(0,(event.clientX-rect.left)/Math.max(1,rect.width)));
    audio.currentTime=ratio*total;
    update();
  });
  audio.addEventListener('play',()=>{
    AudioPlaybackController.claim(audio);
    if(play){play.textContent='❚❚';play.setAttribute('aria-label','Tạm dừng ghi âm');}
  });
  audio.addEventListener('pause',()=>{
    AudioPlaybackController.release(audio);
    if(play){play.textContent='▶';play.setAttribute('aria-label','Phát ghi âm');}
  });
  audio.addEventListener('ended',()=>{
    AudioPlaybackController.release(audio);
    if(play){play.textContent='▶';play.setAttribute('aria-label','Phát ghi âm');}
    audio.currentTime=0;update();
  });
  audio.addEventListener('loadedmetadata',update);
  audio.addEventListener('durationchange',update);
  audio.addEventListener('timeupdate',update);
  update();
}

function patchAudioMediaNode(node,media){
  if(!node)return node;
  node.dataset.mediaAudioAssetId=String(media.assetId||'');
  node.dataset.mediaAccountId=String(media.accountId||currentMediaAccountId()||'');
  const sec=Math.max(0,Number(media.durationSeconds)||Math.round((Number(media.durationMs)||0)/1000));
  node.dataset.audioDurationSeconds=String(sec);
  const audio=node.querySelector('audio');
  if(audio&&!audio.getAttribute('src')){
    if(!primeAudioElementFromMemory(audio,media))void ensureAudioElementReady(audio,media);
  }
  bindAudioMiniPlayer(node,audio);
  const time=node.querySelector('[data-audio-time]');
  if(time&&!audio?.currentTime)time.textContent=`00:00 / ${formatAudioClock(sec)}`;
  return node;
}

function createAudioMediaNode(media){
  const wrap=document.createElement('div');
  wrap.className='audio-message-card';
  wrap.dataset.mediaAudioAssetId=String(media.assetId||'');
  wrap.dataset.mediaAccountId=String(media.accountId||currentMediaAccountId()||'');

  const play=document.createElement('button');
  play.type='button';
  play.className='audio-message-play';
  play.dataset.audioPlay='true';
  play.textContent='▶';
  play.setAttribute('aria-label','Phát ghi âm');

  const progress=document.createElement('button');
  progress.type='button';
  progress.className='audio-message-progress';
  progress.dataset.audioProgress='true';
  progress.setAttribute('aria-label','Tua ghi âm');
  const fill=document.createElement('span');
  fill.className='audio-message-progress-fill';
  fill.dataset.audioProgressFill='true';
  progress.appendChild(fill);

  const time=document.createElement('span');
  time.className='audio-message-time';
  time.dataset.audioTime='true';
  time.textContent='00:00 / 00:00';

  const audio=document.createElement('audio');
  audio.preload='metadata';
  audio.setAttribute('aria-hidden','true');

  wrap.append(play,progress,time,audio);
  patchAudioMediaNode(wrap,media);
  return wrap;
}

function mediaDescriptorsForMessage(message){
  const media=message?.media||null;
  if(!media)return[];
  if(media.type==='gallery')return (Array.isArray(media.items)?media.items:[]).filter(Boolean);
  return[media];
}

function extensionForMime(mime=''){
  const type=String(mime||'').toLowerCase();
  if(type==='application/pdf')return 'pdf';
  if(type==='application/msword')return 'doc';
  if(type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document')return 'docx';
  if(type==='application/vnd.ms-excel')return 'xls';
  if(type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')return 'xlsx';
  if(type==='text/plain')return 'txt';
  if(type==='text/csv')return 'csv';
  if(type==='image/png')return 'png';
  if(type==='image/webp')return 'webp';
  if(type==='image/gif')return 'gif';
  if(type.startsWith('image/'))return 'jpg';
  return 'bin';
}

function fileTypeLabel(media){
  const rawName=String(media?.name||media?.displayName||'');
  const ext=(rawName.match(/\.([a-z0-9]{1,8})$/i)?.[1]||extensionForMime(media?.mimeType||'')).toUpperCase();
  if(['PDF','DOC','DOCX','XLS','XLSX','TXT','CSV'].includes(ext))return ext;
  return 'TỆP';
}

async function mediaBlobForDescriptor(media){
  const accountId=String(media?.accountId||currentMediaAccountId()||'');
  const assetId=String(media?.assetId||'');
  if(!accountId||!assetId||accountId!==String(currentMediaAccountId()||''))return null;
  let row=await window.V21MediaCache?.get?.({accountId,assetId});
  if(!(row?.blob instanceof Blob))row=await window.V21SyncEngine?.ensureMediaRemote?.({accountId,assetId});
  if(!(row?.blob instanceof Blob)||accountId!==String(currentMediaAccountId()||''))return null;
  return{row,blob:row.blob,accountId,assetId};
}

function mediaDownloadName(media,index=0){
  if(messagePrimaryMediaKind({media})==='file'){
    return String(media?.name||media?.displayName||`Tep-${index+1}`).trim()||`Tep-${index+1}`;
  }
  const ext=extensionForMime(media?.mimeType||'image/jpeg');
  return `Anh-${index+1}.${ext}`;
}

async function saveMediaDescriptor(media,index=0){
  const resolved=await mediaBlobForDescriptor(media);
  if(!resolved)return false;
  const cacheKey=`${resolved.accountId}::${resolved.assetId}`;
  let url=mediaObjectUrls.get(cacheKey);
  if(!url){url=URL.createObjectURL(resolved.blob);mediaObjectUrls.set(cacheKey,url);}
  const link=document.createElement('a');
  link.href=url;
  link.download=mediaDownloadName(media,index);
  link.rel='noopener';
  link.style.display='none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

async function saveMessageMedia(message){
  const list=mediaDescriptorsForMessage(message).filter(item=>
    item&&(item.kind==='file'||item.type==='image'||item.kind==='image')
  );
  let saved=0;
  for(const [index,item] of list.entries()){
    if(await saveMediaDescriptor(item,index))saved+=1;
  }
  return saved;
}

async function shareMessageMedia(message){
  if(!canNativeShareFiles())return false;
  const list=mediaDescriptorsForMessage(message).filter(item=>
    item&&(item.kind==='file'||item.type==='image'||item.kind==='image')
  );
  const files=[];
  for(const [index,item] of list.entries()){
    const resolved=await mediaBlobForDescriptor(item);
    if(!resolved)continue;
    const name=mediaDownloadName(item,index);
    const type=String(item?.mimeType||resolved.blob.type||'application/octet-stream');
    files.push(resolved.blob instanceof File&&resolved.blob.name===name
      ?resolved.blob
      :new File([resolved.blob],name,{type,lastModified:Date.now()}));
  }
  if(!files.length)return false;
  if(typeof navigator.canShare==='function'&&!navigator.canShare({files}))return false;
  try{
    await navigator.share({files,title:files.length===1?files[0].name:'Tệp đính kèm'});
    return true;
  }catch(error){
    if(String(error?.name||'')==='AbortError')return false;
    throw error;
  }
}

async function openFileMedia(media){
  const popup=window.open('about:blank','_blank');
  if(popup)try{popup.opener=null;}catch{}
  try{
    const resolved=await mediaBlobForDescriptor(media);
    if(!resolved){popup?.close?.();return false;}
    const cacheKey=`${resolved.accountId}::${resolved.assetId}`;
    let url=mediaObjectUrls.get(cacheKey);
    if(!url){url=URL.createObjectURL(resolved.blob);mediaObjectUrls.set(cacheKey,url);}
    if(popup){
      popup.location.href=url;
      return true;
    }
    const link=document.createElement('a');
    link.href=url;
    link.target='_blank';
    link.rel='noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  }catch(error){
    popup?.close?.();
    throw error;
  }
}

async function hydrateFileCardMeta(node,media){
  if(!node||!media?.assetId)return false;
  const current=String(media?.name||media?.displayName||'').trim();
  if(current&&current!=='Tệp')return false;
  const accountId=String(media?.accountId||currentMediaAccountId()||'');
  const row=await window.V21MediaCache?.get?.({accountId,assetId:String(media.assetId)});
  const name=String(row?.remote_meta?.file_name||'').trim();
  if(!name||!node.isConnected)return false;
  media.name=name;
  media.displayName=name;
  const nameNode=node.querySelector('[data-file-name]');
  if(nameNode)nameNode.textContent=name;
  const meta=node.querySelector('[data-file-meta]');
  if(meta)meta.textContent=`${fileTypeLabel(media)} · ${formatBytes(Number(media.sizeBytes??media.size)||0)}`;
  const icon=node.querySelector('[data-file-type-icon]');
  if(icon)icon.textContent=fileTypeLabel(media).slice(0,4);
  node.setAttribute('aria-label',`Mở ${name}`);
  return true;
}

async function downloadFileMedia(media){
  return saveMediaDescriptor(media,0);
}

function patchFileMediaNode(node,media){
  if(!node)return node;
  node.dataset.mediaFileAssetId=String(media.assetId||'');
  node.dataset.mediaAccountId=String(media.accountId||currentMediaAccountId()||'');
  const name=String(media.name||media.displayName||'Tệp');
  const nameNode=node.querySelector('[data-file-name]');
  if(nameNode)nameNode.textContent=name;
  const meta=node.querySelector('[data-file-meta]');
  if(meta)meta.textContent=`${fileTypeLabel(media)} · ${formatBytes(Number(media.sizeBytes??media.size)||0)}`;
  const icon=node.querySelector('[data-file-type-icon]');
  if(icon)icon.textContent=fileTypeLabel(media).slice(0,4);
  node.setAttribute('aria-label',`Mở ${name}`);
  node.title='Mở tệp';
  node.onclick=()=>{void openFileMedia(media);};
  if(!name||name==='Tệp')void hydrateFileCardMeta(node,media);
  return node;
}

function createFileMediaNode(media){
  const card=document.createElement('button');
  card.type='button';
  card.className='file-message-card';
  card.dataset.mediaFileAssetId=String(media.assetId||'');
  card.dataset.mediaAccountId=String(media.accountId||currentMediaAccountId()||'');

  const icon=document.createElement('span');
  icon.className='file-message-icon';
  icon.setAttribute('aria-hidden','true');
  icon.dataset.fileTypeIcon='true';
  icon.textContent=fileTypeLabel(media).slice(0,4);

  const copy=document.createElement('span');
  copy.className='file-message-copy';
  const name=document.createElement('strong');
  name.className='file-message-name';
  name.dataset.fileName='true';
  const meta=document.createElement('span');
  meta.className='file-message-meta';
  meta.dataset.fileMeta='true';
  copy.append(name,meta);

  card.append(icon,copy);
  patchFileMediaNode(card,media);
  return card;
}

function patchMediaNode(node,media,{message=null}={}){
  if(!node||!media)return node;

  if(media.type==='gallery'&&node.dataset.mediaRootKind==='gallery'){
    return patchImageGalleryNode(node,media,{message});
  }

  if(media.type==='image'&&node.dataset.mediaRootKind==='image'){
    patchImageTileNode(node,media,{
      viewerContext:{
        messageId:message?.id||'',
        senderKey:message?.sender||'remote',
        createdAt:message?.createdAt||Date.now()
      }
    });
    node.classList.toggle('mt-2',Boolean(message?.text||message?.replyTo));
    node.style.width=`${singleImageDisplayWidth(media)}px`;
    node.style.maxWidth='100%';
    return node;
  }

  if(media.type==='file'&&node.dataset.mediaRootKind==='file'){
    node.classList.toggle('mt-2',Boolean(message?.text||message?.replyTo));
    if(media.kind==='audio')return patchAudioMediaNode(node,media);
    return patchFileMediaNode(node,media);
  }

  return node;
}

function mediaRootReuseKey(media){
  if(!media)return 'none';
  const type=String(media.type||'');
  if(type==='gallery')return 'gallery';
  if(type==='image')return `image:${String(media.assetId||'')}`;
  if(type==='file')return `file:${String(media.kind||'file')}`;
  return String(media.type||media.kind||'media');
}

function createMediaNode(media,{message=null}={}){
  if(!media)return null;

  let node=null;
  if(media.type==='gallery'){
    node=createImageGalleryNode(media,{message});
  }else if(media.type==='image'){
    const wrap=createImageTile(media,{
      className:'block h-full w-full object-contain',
      viewerContext:{messageId:message?.id||'',senderKey:message?.sender||'remote',createdAt:message?.createdAt||Date.now()}
    });
    wrap.className+=' max-w-full rounded-xl';
    if(message?.text||message?.replyTo)wrap.classList.add('mt-2');
    wrap.style.width=`${singleImageDisplayWidth(media)}px`;
    wrap.style.maxWidth='100%';
    node=wrap;
  }else if(media.type==='file'){
    if(media.kind==='audio'){
      node=createAudioMediaNode(media);
      if(message?.text||message?.replyTo)node.classList.add('mt-2');
    }
    else{
      node=createFileMediaNode(media);
      if(message?.text||message?.replyTo)node.classList.add('mt-2');
    }
  }

  if(node){
    node.dataset.messageMediaRoot='true';
    node.dataset.mediaRootKind=String(media.type||'media');
    node.dataset.mediaReuseKey=mediaRootReuseKey(media);
  }
  return node;
}

function retryMountedImageHydration({accountId=currentMediaAccountId(),assetId=''}={}){
  const ownerAccountId=String(accountId||'');
  const targetAssetId=String(assetId||'');
  if(!ownerAccountId||ownerAccountId!==String(currentMediaAccountId()||''))return 0;
  let requested=0;
  for(const wrap of document.querySelectorAll('[data-media-asset-id]')){
    const wrapAssetId=String(wrap.dataset.mediaAssetId||'');
    const wrapAccountId=String(wrap.dataset.mediaAccountId||ownerAccountId);
    if(targetAssetId&&wrapAssetId!==targetAssetId)continue;
    if(!wrapAssetId||wrapAccountId!==ownerAccountId)continue;
    const img=wrap.querySelector('img');
    if(!img||img.dataset.ready==='true')continue;
    requested+=1;
    void hydrateImageElement(img,{assetId:wrapAssetId,accountId:wrapAccountId});
  }
  return requested;
}

document.addEventListener('v21-media-ready',event=>{
  const accountId=String(event.detail?.accountId||'');
  const assetId=String(event.detail?.assetId||'');
  if(!accountId||!assetId)return;
  retryMountedImageHydration({accountId,assetId});
  for(const wrap of document.querySelectorAll('[data-media-audio-asset-id]')){
    if(String(wrap.dataset.mediaAudioAssetId||'')!==assetId)continue;
    const audio=wrap.querySelector('audio');
    if(audio&&!audio.getAttribute('src'))void ensureAudioElementReady(audio,{accountId,assetId});
  }
});

document.addEventListener('v21-media-removed',event=>{
  const accountId=String(event.detail?.accountId||'');
  const assetId=String(event.detail?.assetId||'');
  if(!accountId||!assetId)return;
  releaseMediaObjectUrl({accountId,assetId});
  const previewUrl=localImagePreviewUrls.get(assetId);
  if(previewUrl){
    URL.revokeObjectURL(previewUrl);
    localImagePreviewUrls.delete(assetId);
  }
  for(const wrap of document.querySelectorAll('[data-media-asset-id]')){
    if(String(wrap.dataset.mediaAssetId||'')!==assetId)continue;
    if(String(wrap.dataset.mediaAccountId||accountId)!==accountId)continue;
    const img=wrap.querySelector('img');
    if(img){img.removeAttribute('src');img.dataset.ready='false';}
    wrap.dataset.ready='false';
  }
  if(imageViewerOverlay?.open&&imageViewerItems.some(item=>
    String(item?.accountId||'')===accountId&&String(item?.assetId||'')===assetId
  ))closeImageViewer();
  scheduleMediaObjectUrlSweep();
});

window.addEventListener('online',()=>{
  // An image may have mounted while offline with metadata but no Blob. Once
  // connectivity returns, retry only the currently mounted/current-account
  // tiles. This is a UI demand signal; SyncEngine still owns the download.
  requestAnimationFrame(()=>retryMountedImageHydration());
});

window.addEventListener('pagehide',()=>{
  AudioPlaybackController.stopAll({reset:false});
  if(mediaObjectUrlSweepFrame){cancelAnimationFrame(mediaObjectUrlSweepFrame);mediaObjectUrlSweepFrame=0;}
  for(const url of mediaObjectUrls.values())URL.revokeObjectURL(url);
  mediaObjectUrls.clear();
  for(const url of localImagePreviewUrls.values())URL.revokeObjectURL(url);
  localImagePreviewUrls.clear();
  for(const url of localAudioPreviewUrls.values())URL.revokeObjectURL(url);
  localAudioPreviewUrls.clear();
});

function iconSvg(name){
  if(name==='copy'){
    return ChatGPTRef?.iconMarkup('copy-user')||'';
  }
  if(name==='share'){
    return ChatGPTRef?.iconMarkup('share')||'';
  }
  if(name==='save'){
    return ChatGPTRef?.iconMarkup('scroll-down')||'';
  }
  if(name==='reply' || name==='important'){
    return P2PRef?.iconMarkup(name)||'';
  }
  return '';
}

function makeActionButton({
  label,
  icon,
  pressed=null,
  onClick
}){
  const button=document.createElement('button');
  button.type='button';
  button.className='action-button text-token-text-secondary';
  button.setAttribute('aria-label',label);
  button.title=label;
  button.dataset.messageAction=String(icon||label||'action');

  if(pressed!==null){
    button.setAttribute(
      'aria-pressed',
      pressed?'true':'false'
    );
  }

  button.innerHTML=iconSvg(icon);
  button.addEventListener('click',onClick);
  return button;
}

async function copyMessageText(message,button){
  try{
    await navigator.clipboard.writeText(message.text);
    button.dataset.state='copied';
    button.setAttribute('aria-label','Đã sao chép');
    setTimeout(()=>{
      button.dataset.state='closed';
      button.setAttribute(
        'aria-label',
        message.sender==='self'
          ?'Sao chép tin nhắn'
          :'Sao chép phản hồi'
      );
    },900);
  }catch{
    const area=document.createElement('textarea');
    area.value=message.text;
    area.style.position='fixed';
    area.style.opacity='0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

function messagePrimaryMediaKind(message){
  const media=message?.media||null;
  if(!media)return 'text';
  if(media.type==='image'||media.type==='gallery'||media.kind==='image'||media.kind==='image-gallery')return 'image';
  if(media.kind==='audio'||media.type==='audio')return 'audio';
  return 'file';
}

function replyPreviewForMessage(message){
  const kind=messagePrimaryMediaKind(message);
  if(kind==='file'){
    return String(message?.media?.name||message?.media?.displayName||'Tệp').trim()||'Tệp';
  }
  if(kind==='audio')return 'Tin nhắn thoại';
  if(kind==='image')return 'Ảnh';
  const text=String(message?.text||'').replace(/\s+/g,' ').trim();
  return text.slice(0,160)||'Tin nhắn';
}

function canNativeShareFiles(){
  if(typeof navigator?.share!=='function'||typeof File!=='function')return false;
  if(typeof navigator.canShare!=='function')return true;
  try{
    const probe=new File(['x'],'x.txt',{type:'text/plain'});
    return navigator.canShare({files:[probe]});
  }catch{return false;}
}

function canReplyToMessage(message){
  const id=String(message?.id||'');
  return MESSAGE_FEATURES.reply &&
    !['sending','failed'].includes(String(message?.status||'')) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function createActionGroup(message){
  const group=document.createElement('div');
  const isSelf=message.sender==='self';
  group.__message=message;

  group.className=
    `message-action-group ${
      isSelf
        ?'user-actions justify-end'
        :'assistant-actions justify-start'
    }`;
  group.dataset.kind=
    isSelf
      ?'user-actions'
      :'assistant-actions';
  group.setAttribute('aria-label','Thao tác tin nhắn');
  group.setAttribute('role','group');

  const resolveMessage=()=>group.__message||message;

  if(canReplyToMessage(message)){
    group.appendChild(makeActionButton({
      label:'Trả lời',
      icon:'reply',
      onClick:event=>{
        event.stopPropagation();
        setReplyTarget(resolveMessage());
      }
    }));
  }

  const kind=messagePrimaryMediaKind(message);
  if(kind==='text'){
    let copy;
    copy=makeActionButton({
      label:'Sao chép',
      icon:'copy',
      onClick:event=>{
        event.stopPropagation();
        copyMessageText(resolveMessage(),copy);
        closeAllTurnActions();
      }
    });
    group.appendChild(copy);
  }else if(kind==='image'||kind==='file'){
    group.appendChild(makeActionButton({
      label:'Lưu',
      icon:'save',
      onClick:event=>{
        event.stopPropagation();
        void saveMessageMedia(resolveMessage()).finally(()=>closeAllTurnActions());
      }
    }));
    if(canNativeShareFiles()){
      group.appendChild(makeActionButton({
        label:'Chia sẻ',
        icon:'share',
        onClick:event=>{
          event.stopPropagation();
          void shareMessageMedia(resolveMessage()).finally(()=>closeAllTurnActions());
        }
      }));
    }
  }

  return group;
}

let replyTarget=null;

function compactReplyTarget(message){
  return {
    id:message.id,
    text:replyPreviewForMessage(message),
    sender:message.sender
  };
}

function setReplyTarget(message){
  if(!MESSAGE_FEATURES.reply)return;
  replyTarget=compactReplyTarget(message);
  replyContextLabel.textContent=
    message.sender==='self'
      ?'Đang trả lời tin của bạn'
      :'Đang trả lời B';
  replyContextText.textContent=replyTarget.text;
  setInteractionGeometryAnchor(replyTarget.id,{kind:'reply'});
  replyContext.hidden=false;
  ComposerDraftOwner.saveCurrent();
  closeAllTurnActions();
  editor.focus({preventScroll:true});
  requestAnimationFrame(()=>scheduleInteractionAnchorGeometryReconcile('reply-open'));
}

function clearReplyTarget(){
  replyTarget=null;
  replyContext.hidden=true;
  replyContextText.textContent='';
  clearInteractionGeometryAnchor('reply');
  if(typeof ComposerDraftOwner!=='undefined')ComposerDraftOwner.saveCurrent();
}

function toggleMessageImportant(message){
  if(!MESSAGE_FEATURES.important)return;
  message.important=!message.important;
  closeAllTurnActions();
  renderWindow({
    preserve:'ANCHOR',
    anchorIndexOverride:store.indexOfId(message.id)
  });
}

function scrollToReferencedMessage(messageId){
  const index=store.indexOfId(messageId);
  if(index<0)return;

  renderWindow({
    preserve:'ANCHOR',
    anchorIndexOverride:index
  });

  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      const escaped=window.CSS?.escape?CSS.escape(messageId):String(messageId).replace(/"/g,'\\"');
      const node=messageWindow.querySelector(`.message-turn[data-id="${escaped}"]`);
      if(!node)return;
      node.scrollIntoView({block:'center',behavior:'smooth'});
      node.dataset.referenceFlash='true';
      setTimeout(()=>{delete node.dataset.referenceFlash},900);
    });
  });
}

function createReplyQuote(replyTo){
  if(!replyTo)return null;
  const quote=document.createElement('button');
  quote.type='button';
  quote.className='reply-quote';
  quote.setAttribute('aria-label','Đi đến tin nhắn được trả lời');

  const label=document.createElement('span');
  label.className='reply-quote-label';
  label.textContent=replyTo.sender==='self'?'Bạn':'B';

  const text=document.createElement('span');
  text.className='reply-quote-text';
  text.textContent=replyTo.text||'Tin nhắn';

  quote.append(label,text);
  quote.addEventListener('pointerdown',event=>event.stopPropagation());
  quote.addEventListener('pointerup',event=>event.stopPropagation());
  quote.addEventListener('click',event=>{
    event.stopPropagation();
    scrollToReferencedMessage(replyTo.id);
  });
  return quote;
}

function closeAllTurnActions(except=null){
  for(const turn of messageWindow.querySelectorAll(
    '.message-turn[data-actions-open="true"]'
  )){
    if(turn!==except){
      turn.dataset.actionsOpen='false';
    }
  }
}

function toggleActionsForTurn(turn,force){
  if(!turn)return;

  const next=
    typeof force==='boolean'
      ?force
      :turn.dataset.actionsOpen!=='true';

  closeAllTurnActions(turn);

  turn.dataset.actionsOpen=
    next?'true':'false';
}

function bindTurnActionTap(turn,target){
  if(!turn||!target||target.dataset.turnActionBound==='true')return;
  target.dataset.turnActionBound='true';
  let timer=0;
  let pointerId=null;
  let startX=0;
  let startY=0;
  let fired=false;

  const cancel=()=>{
    if(timer){clearTimeout(timer);timer=0;}
    pointerId=null;
  };

  target.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'||event.button!==0)return;
    cancel();
    pointerId=event.pointerId;
    startX=event.clientX;
    startY=event.clientY;
    fired=false;
    timer=setTimeout(()=>{
      timer=0;
      if(pointerId!==event.pointerId)return;
      fired=true;
      turn.dataset.suppressNextClick='true';
      toggleActionsForTurn(turn,true);
      if(navigator.vibrate)try{navigator.vibrate(10);}catch{}
    },420);
  },{passive:true});

  target.addEventListener('pointermove',event=>{
    if(pointerId!==event.pointerId)return;
    const dx=event.clientX-startX;
    const dy=event.clientY-startY;
    if((dx*dx+dy*dy)>100)cancel();
  },{passive:true});

  target.addEventListener('pointerup',event=>{
    if(pointerId!==event.pointerId)return;
    cancel();
  },{passive:true});

  target.addEventListener('pointercancel',cancel,{passive:true});

  target.addEventListener('click',event=>{
    if(turn.dataset.suppressNextClick!=='true')return;
    delete turn.dataset.suppressNextClick;
    event.preventDefault();
    event.stopImmediatePropagation();
  },true);
}

document.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse')return;

  if(!event.target.closest('.message-turn')){
    closeAllTurnActions();
  }
},{passive:true});

function patchMessageIdentity(node,message){
  if(!node||!message)return node;
  const previousId=String(node.dataset.id||'');
  const nextId=String(message.id||'');
  node.__message=message;
  node.dataset.id=nextId;
  node.dataset.renderKey=stableMessageDomKey(message);
  node.dataset.turn=message.sender==='self'?'user':'assistant';

  if(previousId&&nextId&&previousId!==nextId&&heightCache.has(previousId)){
    if(!heightCache.has(nextId))heightCache.set(nextId,heightCache.get(previousId));
    heightCache.delete(previousId);
  }

  const group=node.querySelector('.message-action-group');
  if(group)group.__message=message;

  const gallery=node.querySelector('.media-gallery-grid[data-message-media-root="true"]');
  if(gallery)gallery.dataset.albumId=nextId;
  for(const tile of node.querySelectorAll('[data-media-asset-id]')){
    tile.dataset.viewerMessageId=nextId;
  }
  return node;
}

function patchMessageNode(node,message){
  patchMessageIdentity(node,message);

  const outer=node.firstElementChild;
  const stack=outer?.firstElementChild;
  const messageWrap=stack?.firstElementChild;
  const unit=messageWrap?.firstElementChild;
  if(!outer||!messageWrap||!unit)return node;

  outer.className=
    message.sender==='self'
      ?'chat-content-axis pt-3'
      :'assistant-turn-shell chat-content-axis';
  messageWrap.className=
    message.sender==='self'
      ?'flex w-full justify-end'
      :'assistant-message flex w-full justify-start';
  unit.className=
    message.sender==='self'
      ?'message-unit user-message-unit'
      :'message-unit assistant-message-unit';
  unit.dataset.important=message.important?'true':'false';

  let text=unit.querySelector(':scope > .message-text');
  if(!text){
    text=document.createElement('div');
    unit.insertBefore(text,unit.firstChild);
    bindTurnActionTap(node,text);
  }
  text.className='message-text whitespace-pre-wrap break-words'+(
    message.sender==='self'
      ?' cgpt-source-user-visual'
      :' cgpt-source-assistant-visual min-h-8 py-1'
  );
  text.replaceChildren();
  const replyQuote=createReplyQuote(message.replyTo);
  if(replyQuote)text.appendChild(replyQuote);
  const messageBody=document.createElement('div');
  messageBody.className='message-body';
  messageBody.textContent=message.text;
  text.appendChild(messageBody);
  const textVisible=Boolean(message.replyTo||message.kind==='text'||message.kind==='mixed');
  text.hidden=!textVisible;

  let actionGroup=unit.querySelector(':scope > .message-action-group');
  if(!actionGroup){
    actionGroup=createActionGroup(message);
    unit.appendChild(actionGroup);
  }else{
    actionGroup.__message=message;
    const isSelf=message.sender==='self';
    actionGroup.className=
      `message-action-group ${isSelf?'user-actions justify-end':'assistant-actions justify-start'}`;
    actionGroup.dataset.kind=isSelf?'user-actions':'assistant-actions';
  }

  const existingMedia=unit.querySelector(':scope > [data-message-media-root="true"]');
  if(!message.media){
    existingMedia?.remove();
  }else{
    const reuseKey=mediaRootReuseKey(message.media);
    if(existingMedia&&String(existingMedia.dataset.mediaReuseKey||'')===reuseKey){
      patchMediaNode(existingMedia,message.media,{message});
      existingMedia.dataset.mediaReuseKey=reuseKey;
      existingMedia.dataset.mediaRootKind=String(message.media.type||'media');
      if(existingMedia.nextElementSibling!==actionGroup){
        unit.insertBefore(existingMedia,actionGroup);
      }
    }else{
      const nextMedia=createMediaNode(message.media,{message});
      if(nextMedia){
        bindTurnActionTap(node,nextMedia);
        if(existingMedia)existingMedia.replaceWith(nextMedia);
        else unit.insertBefore(nextMedia,actionGroup);
      }else{
        existingMedia?.remove();
      }
    }
  }

  node.__visualSignature=messageVisualSignature(message);
  return node;
}

function renderMessageNode(message){
  const turn=document.createElement('section');
  turn.className=
    'message-row message-turn group/turn-messages w-full text-[16px] text-token-text-primary';
  turn.dataset.id=message.id;
  turn.dataset.renderKey=stableMessageDomKey(message);
  turn.dataset.turn=
    message.sender==='self'
      ?'user'
      :'assistant';
  turn.__message=message;

  const outer=document.createElement('div');
  outer.className=
    message.sender==='self'
      ?'chat-content-axis pt-3'
      :'assistant-turn-shell chat-content-axis';

  const stack=document.createElement('div');
  stack.className='flex w-full flex-col';

  const messageWrap=document.createElement('div');
  messageWrap.className=
    message.sender==='self'
      ?'flex w-full justify-end'
      :'assistant-message flex w-full justify-start';

  const unit=document.createElement('div');
  unit.className=
    message.sender==='self'
      ?'message-unit user-message-unit'
      :'message-unit assistant-message-unit';
  unit.dataset.important=message.important?'true':'false';

  const text=document.createElement('div');
  text.className='message-text whitespace-pre-wrap break-words';
  if(message.sender==='self'){
    text.className+=' cgpt-source-user-visual';
  }else{
    text.className+=' cgpt-source-assistant-visual min-h-8 py-1';
  }
  const replyQuote=createReplyQuote(message.replyTo);
  if(replyQuote)text.appendChild(replyQuote);
  const messageBody=document.createElement('div');
  messageBody.className='message-body';
  messageBody.textContent=message.text;
  text.appendChild(messageBody);
  const textVisible=Boolean(message.replyTo||message.kind==='text'||message.kind==='mixed');
  text.hidden=!textVisible;
  unit.appendChild(text);
  bindTurnActionTap(turn,text);

  if(message.media){
    const mediaNode=createMediaNode(message.media,{message});
    if(mediaNode)unit.appendChild(mediaNode);
    if(mediaNode)bindTurnActionTap(turn,mediaNode);
  }

  unit.appendChild(createActionGroup(message));
  messageWrap.appendChild(unit);
  stack.appendChild(messageWrap);
  outer.appendChild(stack);
  turn.appendChild(outer);
  turn.__visualSignature=messageVisualSignature(message);
  return turn;
}

function reconcileMessageWindow(messages){
  const desired=Array.isArray(messages)?messages:[];
  const existingByKey=new Map();
  for(const node of Array.from(messageWindow.children)){
    const key=String(node.dataset.renderKey||'');
    if(key&&!existingByKey.has(key))existingByKey.set(key,node);
  }

  const nodes=[];
  const dirty=new Set();

  for(const message of desired){
    const key=stableMessageDomKey(message);
    let node=existingByKey.get(key)||null;
    if(node){
      existingByKey.delete(key);
      patchMessageIdentity(node,message);
      const nextSignature=messageVisualSignature(message);
      if(node.__visualSignature!==nextSignature){
        patchMessageNode(node,message);
        dirty.add(node);
      }
    }else{
      node=renderMessageNode(message);
      dirty.add(node);
    }
    nodes.push(node);
  }

  for(const stale of existingByKey.values()){
    stale.remove();
  }

  // Message virtualization owns DOM presence, while this URL pool only owns
  // page-memory object URLs. Reclaim URLs after stale/offscreen nodes leave the
  // DOM; cached Blobs remain in MediaCache and can recreate a URL on demand.
  scheduleMediaObjectUrlSweep();

  let cursor=messageWindow.firstElementChild;
  for(const node of nodes){
    if(node===cursor){
      cursor=cursor.nextElementSibling;
    }else{
      messageWindow.insertBefore(node,cursor);
    }
  }

  return dirty;
}

function findAnchorIndex(anchor){
  if(!anchor)return null;
  if(anchor.renderKey){
    const index=store.items.findIndex(message=>stableMessageDomKey(message)===anchor.renderKey);
    if(index>=0)return index;
  }
  if(anchor.id){
    const index=store.indexOfId(anchor.id);
    if(index>=0)return index;
  }
  return null;
}

function renderWindow({
  preserve='AUTO',
  anchorIndexOverride=null,
  historyRestore=false
}={}){
  const viewEpoch=conversationViewEpoch;
  // VIEW keeps the current virtual window anchored by identity/index only; it
  // never writes scrollTop. ANCHOR is reserved for an explicit restore owned
  // by ScrollController (history prepend / window rebase).
  const anchor=
    preserve==='ANCHOR'||preserve==='VIEW'
      ?firstVisibleAnchor()
      :null;
  const beforeScrollTop=preserve==='ANCHOR'?scrollRoot.scrollTop:0;

  if(historyRestore)viewport.beginHistoryRestore();

  let anchorIndex=
    Number.isFinite(Number(anchorIndexOverride))
      ?Number(anchorIndexOverride)
      :null;

  if(anchorIndex===null&&anchor){
    anchorIndex=findAnchorIndex(anchor);
  }

  const win=dataWindow.compute({
    messages:store.items,
    anchorIndex,
    tailMode:viewport.mode===VIEWPORT_STATES.FOLLOW_TAIL
  });

  renderedRange={
    start:win.start,
    end:win.end
  };

  const width=messageLayoutWidthPx();

  topSpacer.style.height=
    dataWindow.estimateSpacer(
      store.items,
      0,
      win.start,
      width,
      heightCache
    )+'px';

  bottomSpacer.style.height=
    dataWindow.estimateSpacer(
      store.items,
      win.end,
      store.items.length,
      width,
      heightCache
    )+'px';

  const dirtyNodes=reconcileMessageWindow(win.items);

  requestAnimationFrame(()=>{
    for(const node of dirtyNodes){
      if(!node.isConnected)continue;
      const id=node.dataset.id;
      if(id){
        heightCache.set(
          id,
          Math.ceil(node.getBoundingClientRect().height)
        );
      }
    }

    if(viewEpoch!==conversationViewEpoch)return;

    if(preserve==='ANCHOR'){
      if(anchor){
        restoreAnchor(anchor);
      }else{
        setScrollTop(beforeScrollTop);
      }
    }

    if(historyRestore){
      viewport.finishHistoryRestore();
      modeLabel.textContent=viewport.mode;
      updateScrollFromEndControl();
    }
    publishTailRunway();
  });
}

async function loadOlder(){
  if(
    loadingOlder ||
    olderCursor<=0
  )return;

  loadingOlder=true;
  historyStatus.classList.remove('hidden');
  const viewEpoch=conversationViewEpoch;

  const anchor=firstVisibleAnchor();

  await new Promise(r=>setTimeout(r,100));
  if(viewEpoch!==conversationViewEpoch){
    historyStatus.classList.add('hidden');
    loadingOlder=false;
    return;
  }

  const end=olderCursor;
  const start=Math.max(0,end-50);
  const older=historyItems.slice(start,end);

  store.prependBatch(older);
  olderCursor=start;

  renderWindow({preserve:'ANCHOR',historyRestore:true});

  requestAnimationFrame(()=>{
    // renderWindow owns anchor restoration. HistoryLoader only owns its
    // loading state; a second restoreAnchor here would be a duplicate scroll
    // command from a child.
    historyStatus.classList.add('hidden');
    loadingOlder=false;
  });
}

/* =========================================================
   MOVING DATA WINDOW
   Rebase before a virtual spacer can enter the visible viewport.
   ========================================================= */
const WINDOW_REBASE_MARGIN=28;
let windowRebaseFrame=0;

function logicalIndexAtViewport(){
  if(!store.size)return 0;

  const width=messageLayoutWidthPx();

  const headerHeight=Math.max(
    0,
    regionTop.getBoundingClientRect().height
  );

  const virtualOffset=Math.max(
    0,
    scrollRoot.scrollTop+
    headerHeight-
    threadContent.offsetTop
  );

  return dataWindow.indexAtOffset(
    store.items,
    virtualOffset,
    width,
    heightCache
  );
}

function scheduleWindowRebase(direction){
  if(
    windowRebaseFrame ||
    store.size<=dataWindow.maxDomMessages
  )return;

  const index=logicalIndexAtViewport();
  const viewEpoch=conversationViewEpoch;

  const approachingStart=
    direction==='up' &&
    renderedRange.start>0 &&
    index<=
      renderedRange.start+
      WINDOW_REBASE_MARGIN;

  const approachingEnd=
    direction==='down' &&
    renderedRange.end<store.size &&
    index>=
      renderedRange.end-
      WINDOW_REBASE_MARGIN;

  if(
    !approachingStart &&
    !approachingEnd
  )return;

  windowRebaseFrame=requestAnimationFrame(()=>{
    windowRebaseFrame=0;
    if(viewEpoch!==conversationViewEpoch)return;

    renderWindow({
      preserve:'ANCHOR',
      anchorIndexOverride:index
    });
  });
}

/* =========================================================
   SMART SCROLL
   ========================================================= */
function updateScrollFromEndControl(){
  const awayFromTail=
    viewport.mode!==VIEWPORT_STATES.FOLLOW_TAIL ||
    distanceFromTail()>24;

  scrollRoot.toggleAttribute('data-scroll-from-end',awayFromTail);
  stageLayout.toggleAttribute('data-scroll-from-end',awayFromTail);

  if(threadScrollUnseenBadge){
    const count=Math.max(0,Number(viewport.unseenCount)||0);
    threadScrollUnseenBadge.hidden=count===0;
    threadScrollUnseenBadge.textContent=count>99?'99+':String(count||'');
    threadScrollControl.setAttribute(
      'aria-label',
      count>0?`Cuộn xuống cuối, ${count} tin mới`:'Cuộn xuống cuối'
    );
  }
}

function appendScrollPolicy({inserted=false,remote=false,messageIds=[]}={}){
  if(!inserted){
    return{followTail:false,preserve:'VIEW'};
  }

  // FOLLOW_TAIL / USER_AWAY is the sole scroll policy owner. Transient
  // wheel/touch flags may describe *how* the user interacted, but they must
  // never veto a viewport that is still logically at the tail. Once a real
  // user scroll moves > tailRearmPx, ConversationViewportModel itself enters
  // USER_AWAY and this policy stops following.
  const followTail=viewport.mode===VIEWPORT_STATES.FOLLOW_TAIL;

  if(remote&&!followTail){
    viewport.registerUnseen(messageIds);
  }

  return{
    followTail,
    preserve:followTail?'AUTO':'VIEW'
  };
}

function setUserDragging(active){
  userDragging=Boolean(active);
  scrollRoot.toggleAttribute('data-user-dragging',userDragging);
}

function markUserScrollInteraction(){
  scrollRoot.setAttribute('data-user-scrolling','true');
  clearTimeout(userScrollIdleTimer);
  userScrollIdleTimer=setTimeout(()=>{
    scrollRoot.removeAttribute('data-user-scrolling');
  },140);
}

function isInteractiveScrollIntentTarget(target){
  const node=target instanceof Element?target:null;
  if(!node)return false;
  return Boolean(node.closest(
    'button,a,input,textarea,select,[contenteditable="true"],[data-scroll-intent-ignore="true"]'
  ));
}

scrollRoot.addEventListener(
  'pointerdown',
  event=>{
    // Clicking/focusing Composer controls is UI interaction, not scroll intent.
    // Treating send / mode-toggle / arrow / textarea pointerdown as a drag used
    // to cancel pending tail transactions and let Safari geometry scroll become
    // USER_AWAY. Actual message-surface dragging still enters user-scroll mode.
    if(isInteractiveScrollIntentTarget(event.target))return;
    markUserScrollIntent(900);
    setUserDragging(true);
  },
  {passive:true}
);

window.addEventListener(
  'pointerup',
  ()=>{
    setUserDragging(false);
  },
  {passive:true}
);
window.addEventListener(
  'pointercancel',
  ()=>{
    setUserDragging(false);
  },
  {passive:true}
);

scrollRoot.addEventListener('wheel',()=>markUserScrollIntent(700),{passive:true});
scrollRoot.addEventListener('touchstart',event=>{
  if(isInteractiveScrollIntentTarget(event.target))return;
  markUserScrollIntent(1100);
},{passive:true});
window.addEventListener('keydown',event=>{
  if(document.activeElement===editor)return;
  if(['PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' '].includes(event.key))markUserScrollIntent(700);
},{passive:true});

scrollRoot.addEventListener(
  'scroll',
  ()=>{
    if(programmaticScroll)return;

    const top=scrollRoot.scrollTop;

    // A scroll event is not automatically user intent. Layout/focus/keyboard
    // scroll events are observed but never converted into a second scroll
    // writer. Only real wheel/touch/drag/key intent may change viewport state.
    if(!hasUserScrollIntent()){
      updateScrollFromEndControl();
      return;
    }

    markUserScrollInteraction();
    const direction=top<lastUserScrollTop?'up':'down';
    lastUserScrollTop=top;

    viewport.onUserScroll({
      distanceFromTail:distanceFromTail(),
      direction
    });

    modeLabel.textContent=viewport.mode;
    updateScrollFromEndControl();
    scheduleWindowRebase(direction);

    if(top<360)loadOlder();
  },
  {passive:true}
);

threadScrollControl.addEventListener('click',async()=>{
  try{
    await window.V21MessageStore?.reconcileCurrent?.();
    await new Promise(resolve=>requestAnimationFrame(resolve));
  }finally{
    scrollToTail('user-arrow');
  }
});

/* =========================================================
   REMOTE TYPING
   Real app: drive this from the realtime typing/presence event.
   Demo B+: typing → remote message.
   ========================================================= */
let remoteTyping=false;
let remoteTypingTimer=0;

function setRemoteTyping(active){
  remoteTyping=Boolean(active);
  scrollRoot.toggleAttribute('data-stream-active',remoteTyping);
  stageLayout.toggleAttribute('data-stream-active',remoteTyping);
  remoteTypingCenter.hidden=!remoteTyping;
}

function scheduleRemoteMessageFromDemo(){
  clearTimeout(remoteTypingTimer);
  setRemoteTyping(true);

  remoteTypingTimer=setTimeout(()=>{
    setRemoteTyping(false);
    appendRemote();
  },900);
}

/* =========================================================
   REMOTE / REALTIME DEMO
   ========================================================= */
function appendRemote(){
  const message=createMessage({
    id:`remote-${Date.now()}-${++seq}`,
    text:`B gửi tin mới ${seq}`,
    sender:'remote',
    createdAt:Date.now()+seq
  });
  const before=store.size;
  store.appendBatch([message]);
  const inserted=store.size>before;
  const policy=appendScrollPolicy({
    inserted,remote:true,messageIds:[message.id]
  });

  renderWindow({preserve:policy.preserve});

  if(policy.followTail){
    scrollToTail('remote-message');
  }else{
    updateScrollFromEndControl();
  }
}

remote.addEventListener(
  'pointerdown',
  e=>{
    if(document.activeElement===editor){
      e.preventDefault();
    }
  }
);
remote.addEventListener('click',scheduleRemoteMessageFromDemo);

/* =========================================================
   COMPOSER MULTILINE
   ========================================================= */
const COMPOSER_MEASURE_STYLE_PROPS=[
  'font-family','font-size','font-weight','font-style','letter-spacing','line-height',
  'padding-left','padding-right','padding-top','padding-bottom',
  'border-left-width','border-right-width','box-sizing'
];
let composerMeasureStyleReady=false;
let composerMeasureWidthPx=0;

function syncMeasureStyle({force=false,widthPx=0}={}){
  // Text typing must not force a full Composer/page style read on every key.
  // Typography is stable; copy it once. Mirror width uses the editor border-box,
  // matching Tailwind Preflight box-sizing:border-box instead of contentRect.
  if(force||!composerMeasureStyleReady){
    const cs=getComputedStyle(editor);
    for(const prop of COMPOSER_MEASURE_STYLE_PROPS){
      measure.style.setProperty(prop,cs.getPropertyValue(prop));
    }
    composerMeasureStyleReady=true;
  }

  const nextWidth=Math.max(0,Number(widthPx)||0);
  if(nextWidth>0&&Math.abs(nextWidth-composerMeasureWidthPx)>.5){
    composerMeasureWidthPx=nextWidth;
    measure.style.width=`${nextWidth}px`;
    return true;
  }
  return false;
}

function ensureComposerMeasureReady(){
  if(composerMeasureStyleReady&&composerMeasureWidthPx>0)return;
  // One initial geometry read at boot/restore only; never on the steady typing path.
  syncMeasureStyle({force:true,widthPx:editor.getBoundingClientRect().width});
}

let lastEditorHeightPx=40;
let lastEditorInternalScroll=false;

function autoGrow({source='layout'}={}){
  ensureComposerMeasureReady();

  measure.textContent=
    (editor.value || editor.placeholder || ' ')+'\n';

  const natural=Math.ceil(measure.scrollHeight);

  const next=Math.max(
    40,
    Math.min(112,natural)
  );
  const internalScroll=natural>112;
  const heightChanged=next!==lastEditorHeightPx;
  const scrollModeChanged=internalScroll!==lastEditorInternalScroll;

  if(!heightChanged&&!scrollModeChanged)return false;

  if(heightChanged){
    editor.style.setProperty(
      '--editor-height',
      `${next}px`
    );
    lastEditorHeightPx=next;
  }

  if(scrollModeChanged){
    editor.dataset.internalScroll=internalScroll?'true':'false';
    lastEditorInternalScroll=internalScroll;
  }

  if(heightChanged&&!composerObserver)requestAnimationFrame(publishComposerHeight);
  return true;
}

const composerMeasureObserver=
  typeof ResizeObserver!=='undefined'
    ?new ResizeObserver(entries=>{
        const entry=entries?.[0];
        const borderBox=Array.isArray(entry?.borderBoxSize)
          ?entry.borderBoxSize[0]
          :entry?.borderBoxSize;
        const width=Number(borderBox?.inlineSize)||editor.getBoundingClientRect().width||0;
        if(syncMeasureStyle({widthPx:width}))autoGrow();
      })
    :null;
composerMeasureObserver?.observe(editor);

/* =========================================================
   ATTACHMENTS / RECORDING
   ========================================================= */
let pendingAttachments=[];
let mediaRecorder=null;
let mediaStream=null;
let mediaChunks=[];
let recordingStartedAt=0;
let recordingTimer=0;
let discardRecordingOnStop=false;
let recordingDraftKey=null;
let recordingOwnerScope=null;
let audioWorkflowState='IDLE';
const localAudioPreviewUrls=new Map();

function setAudioWorkflowState(next){
  audioWorkflowState=String(next||'IDLE');
  composerShell.dataset.audioState=audioWorkflowState;
  renderComposerModeHint();
  syncSendButtonState();
}

function currentComposerScope(){
  const auth=window.V21AuthSessionStore?.snapshot?.()||{};
  const sync=window.V21SyncEngine?.snapshot?.()||{};
  const accountId=auth.state==='AUTHENTICATED'?String(auth.account?.id||''):'';
  const conversationId=String(sync.currentConversationId||ComposerDraftOwner?.conversationId||'');
  const contactId=String(sync.currentContactId||ComposerDraftOwner?.contactId||'');
  const ready=Boolean(accountId&&contactId&&conversationId);
  return{
    state:ready?'READY':'RESOLVING',
    accountId,conversationId,contactId,
    mediaKey:ready?`${accountId}::${conversationId}`:'',
    ownerDraftKey:ComposerDraftOwner?.currentKey?.()||''
  };
}

function attachmentBelongsToComposerScope(item,scope=currentComposerScope()){
  if(!item||!scope)return false;
  if(String(item?.accountId||'')!==String(scope.accountId||''))return false;
  if(String(item?.conversationId||'')!==String(scope.conversationId||''))return false;
  if(String(item?.mediaDraftKey||'')!==String(scope.mediaKey||''))return false;
  if(String(item?.ownerDraftKey||'')!==String(scope.ownerDraftKey||''))return false;
  return true;
}


/* =========================================================
   V21.64 COMPOSER DRAFT OWNER
   One in-memory draft per account + conversation/contact.
   File/Blob objects remain local references and are never serialized here.
   Logout/account replacement discards the previous account drafts.
   ========================================================= */
const ComposerDraftOwner={
  accountId:'guest',
  contactId:'none',
  conversationId:null,
  drafts:new Map(),

  key(accountId=this.accountId,contactId=this.contactId,conversationId=this.conversationId){
    const account=String(accountId||'guest');
    const conversation=String(conversationId||'');
    if(conversation)return `${account}::conversation:${conversation}`;
    return `${account}::contact:${String(contactId||'none')}`;
  },

  currentKey(){return this.key();},

  snapshot(){
    return{
      text:String(editor.value||''),
      replyTarget:replyTarget?{...replyTarget}:null,
      attachments:pendingAttachments.slice()
    };
  },

  isEmpty(draft){
    return !draft.text && !draft.replyTarget && draft.attachments.length===0;
  },

  saveCurrent(){
    const key=this.currentKey();
    const draft=this.snapshot();
    if(this.isEmpty(draft))this.drafts.delete(key);
    else this.drafts.set(key,draft);
  },

  restoreCurrent(){
    const draft=this.drafts.get(this.currentKey())||null;
    editor.value=draft?.text||'';
    replyTarget=draft?.replyTarget?{...draft.replyTarget}:null;
    pendingAttachments=draft?.attachments?.slice?.()||[];

    if(replyTarget){
      replyContextLabel.textContent='Đang trả lời';
      replyContextText.textContent=String(replyTarget.text||'');
      replyContext.hidden=false;
    }else{
      replyContext.hidden=true;
      replyContextText.textContent='';
    }

    renderAttachmentTray();
    if(!(mediaRecorder&&mediaRecorder.state!=='inactive')){
      setAudioWorkflowState(pendingAttachments.some(item=>item?.kind==='audio')?'PREVIEW':'IDLE');
    }
    autoGrow();
    syncSendButtonState();
  },

  discardAccount(accountId){
    const prefix=`${String(accountId||'guest')}::`;
    const released=new Set();
    for(const [key,draft] of Array.from(this.drafts.entries())){
      if(!key.startsWith(prefix))continue;
      for(const item of (draft?.attachments||[])){
        const assetId=String(item?.assetId||'');
        if(!assetId||released.has(assetId))continue;
        released.add(assetId);
        releaseLocalAttachment(item,{removeCache:true});
      }
      this.drafts.delete(key);
    }
  },

  stopRecordingForContextChange(){
    if(mediaRecorder && mediaRecorder.state!=='inactive'){
      stopRecording({discard:true});
    }else if(mediaStream){
      mediaStream.getTracks().forEach(track=>track.stop());
      mediaStream=null;
      InteractionController.exit(InteractionMode.AUDIO_RECORDING,{owner:'audio-recorder'});
    }
  },

  switchContext({contactId=this.contactId,conversationId=null}={}){
    const nextContact=String(contactId||'none');
    const nextConversation=conversationId?String(conversationId):null;
    if(nextContact===this.contactId&&nextConversation===this.conversationId)return;
    const previousContact=this.contactId;
    const previousConversation=this.conversationId;
    const previousKey=this.currentKey();
    this.saveCurrent();
    if(nextContact!==previousContact||nextConversation!==previousConversation){
      this.stopRecordingForContextChange();
    }
    this.contactId=nextContact;
    this.conversationId=nextConversation;
    const nextKey=this.currentKey();
    // Resolve contact-scoped draft into its canonical conversation key exactly
    // once. Contact is navigation identity; conversation is message/media truth.
    if(!previousConversation&&nextConversation&&nextContact===previousContact&&previousKey!==nextKey){
      const resolvingDraft=this.drafts.get(previousKey)||null;
      if(resolvingDraft&&!this.drafts.has(nextKey))this.drafts.set(nextKey,resolvingDraft);
      this.drafts.delete(previousKey);
    }
    this.restoreCurrent();
  },

  switchContact(contactId){
    this.switchContext({contactId,conversationId:null});
  },

  switchAccount(accountId){
    const next=String(accountId||'guest');
    if(next===this.accountId)return;
    const previous=this.accountId;
    this.saveCurrent();
    this.stopRecordingForContextChange();
    this.accountId=next;
    this.contactId='none';
    this.conversationId=null;
    if(previous!=='guest')this.discardAccount(previous);
    this.restoreCurrent();
  },

  commitEmptyCurrent(){
    this.drafts.delete(this.currentKey());
  }
};

document.addEventListener('v21-active-contact-change',event=>{
  ComposerDraftOwner.switchContact(event.detail?.contact?.id||'none');
});
document.addEventListener('v21-conversation-context',event=>{
  const detail=event.detail||{};
  const contactId=String(detail.currentContactId||ComposerDraftOwner.contactId||'none');
  if(contactId!==String(ComposerDraftOwner.contactId||'none'))return;
  ComposerDraftOwner.switchContext({
    contactId,
    conversationId:detail.currentConversationId||null
  });
});

document.addEventListener('v21-auth-state',event=>{
  const detail=event.detail||{};
  const accountId=
    detail.state==='AUTHENTICATED'
      ?detail.account?.id||'guest'
      :'guest';
  const previousAccountId=String(ComposerDraftOwner.accountId||'guest');
  const nextAccountId=String(accountId||'guest');
  if(previousAccountId!==nextAccountId)InteractionController.forceReset('account-change');
  ComposerDraftOwner.switchAccount(accountId);
  if(previousAccountId!==nextAccountId){
    AudioPlaybackController.stopAll({reset:true});
    // Object URLs are page-memory ownership, not durable cache. Never retain
    // sent/receiver image URLs across an account boundary.
    closeImageViewer();
    revokeViewerOwnedUrls();
    for(const url of mediaObjectUrls.values())URL.revokeObjectURL(url);
    mediaObjectUrls.clear();
  }
});

function formatBytes(bytes){
  const value=Math.max(0,Number(bytes)||0);
  if(value<1024)return `${value} B`;
  if(value<1024*1024)return `${Math.round(value/1024)} KB`;
  return `${(value/(1024*1024)).toFixed(1)} MB`;
}



const MAX_IMAGE_EDGE=1600;
const IMAGE_ENCODE_QUALITY=.78;
const localImagePreviewUrls=new Map();

function releaseLocalImageAttachment(item,{removeCache=true}={}){
  const assetId=String(item?.assetId||'');
  const ownerAccountId=String(item?.accountId||'');
  if(!assetId)return false;
  const previewUrl=localImagePreviewUrls.get(assetId);
  if(previewUrl){
    URL.revokeObjectURL(previewUrl);
    localImagePreviewUrls.delete(assetId);
  }
  if(removeCache&&ownerAccountId){
    void window.V21MediaCache?.remove?.({accountId:ownerAccountId,assetId});
  }
  return true;
}

function releaseLocalAudioAttachment(item,{removeCache=true}={}){
  const assetId=String(item?.assetId||'');
  const currentAudio=AudioPlaybackController.currentAudio;
  if(currentAudio?.closest?.(`[data-audio-preview-asset-id=\"${CSS.escape(assetId)}\"], [data-media-audio-asset-id=\"${CSS.escape(assetId)}\"]`)){
    AudioPlaybackController.stopAll({reset:true});
  }
  const ownerAccountId=String(item?.accountId||'');
  if(!assetId)return false;
  const previewUrl=localAudioPreviewUrls.get(assetId);
  if(previewUrl){
    URL.revokeObjectURL(previewUrl);
    localAudioPreviewUrls.delete(assetId);
  }
  const cacheKey=ownerAccountId?`${ownerAccountId}::${assetId}`:'';
  const durableUrl=cacheKey?mediaObjectUrls.get(cacheKey):null;
  if(durableUrl){
    URL.revokeObjectURL(durableUrl);
    mediaObjectUrls.delete(cacheKey);
  }
  if(removeCache&&ownerAccountId)void window.V21MediaCache?.remove?.({accountId:ownerAccountId,assetId});
  return true;
}

const MAX_FILE_ATTACHMENT_BYTES=15*1024*1024;
const FILE_MIME_BY_EXTENSION=Object.freeze({
  pdf:'application/pdf',
  txt:'text/plain',
  csv:'text/csv',
  doc:'application/msword',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:'application/vnd.ms-excel',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});

function fileExtension(name){
  const value=String(name||'').trim();
  const dot=value.lastIndexOf('.');
  return dot>0?value.slice(dot+1).toLowerCase():'';
}

function canonicalFileMime(file){
  const extension=fileExtension(file?.name);
  const inferred=FILE_MIME_BY_EXTENSION[extension]||'';
  const native=String(file?.type||'').split(';',1)[0].trim().toLowerCase();
  if(inferred)return inferred;
  if(native&&native!=='application/octet-stream')return native;
  return '';
}

function supportedFileAttachment(file){
  if(!(file instanceof File))return false;
  return Boolean(FILE_MIME_BY_EXTENSION[fileExtension(file.name)]);
}

function releaseLocalFileAttachment(item,{removeCache=true}={}){
  const assetId=String(item?.assetId||'');
  const ownerAccountId=String(item?.accountId||'');
  if(!assetId)return false;
  const cacheKey=ownerAccountId?`${ownerAccountId}::${assetId}`:'';
  const durableUrl=cacheKey?mediaObjectUrls.get(cacheKey):null;
  if(durableUrl){
    URL.revokeObjectURL(durableUrl);
    mediaObjectUrls.delete(cacheKey);
  }
  if(removeCache&&ownerAccountId)void window.V21MediaCache?.remove?.({accountId:ownerAccountId,assetId});
  return true;
}

function releaseLocalAttachment(item,{removeCache=true}={}){
  if(item?.kind==='image')return releaseLocalImageAttachment(item,{removeCache});
  if(item?.kind==='audio')return releaseLocalAudioAttachment(item,{removeCache});
  if(item?.kind==='file')return releaseLocalFileAttachment(item,{removeCache});
  return false;
}

function imageElementDecode(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const image=new Image();
    image.decoding='async';
    const release=()=>URL.revokeObjectURL(url);
    image.onload=()=>resolve({image,url,release});
    image.onerror=()=>{release();reject(new Error('image_decode_failed'));};
    image.src=url;
  });
}

async function imageDimensions(file){
  if(typeof createImageBitmap==='function'){
    try{
      const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
      const result={width:bitmap.width,height:bitmap.height};
      bitmap.close?.();
      return result;
    }catch(_orientedError){
      try{
        const bitmap=await createImageBitmap(file);
        const result={width:bitmap.width,height:bitmap.height};
        bitmap.close?.();
        return result;
      }catch(_bitmapError){
        // WebKit/Android can expose createImageBitmap yet reject a camera/Photo
        // asset that the native <img> decoder can still display (HEIC/JPEG
        // metadata/orientation variants). Fall through to the HTML decoder.
      }
    }
  }
  const decoded=await imageElementDecode(file);
  try{
    return{width:decoded.image.naturalWidth,height:decoded.image.naturalHeight};
  }finally{
    decoded.release();
  }
}

async function optimizeImageBlob(file){
  const original=await imageDimensions(file);
  const width=Math.max(1,Number(original.width)||1);
  const height=Math.max(1,Number(original.height)||1);
  const mime=String(file.type||'').toLowerCase();
  if(mime==='image/gif'||mime==='image/svg+xml')return{blob:file,width,height,compressed:false};

  const scale=Math.min(1,MAX_IMAGE_EDGE/Math.max(width,height));
  if(scale===1&&Number(file.size)<=512*1024)return{blob:file,width,height,compressed:false};

  let source=null;
  let sourceRelease=null;
  try{
    if(typeof createImageBitmap==='function'){
      try{
        source=await createImageBitmap(file,{imageOrientation:'from-image'});
      }catch(_orientedError){
        try{source=await createImageBitmap(file);}catch(_bitmapError){}
      }
    }
    if(!source){
      const decoded=await imageElementDecode(file);
      source=decoded.image;
      sourceRelease=decoded.release;
    }

    const targetWidth=Math.max(1,Math.round(width*scale));
    const targetHeight=Math.max(1,Math.round(height*scale));
    const canvas=document.createElement('canvas');
    canvas.width=targetWidth;canvas.height=targetHeight;
    const context=canvas.getContext('2d',{alpha:true});
    if(!context)return{blob:file,width,height,compressed:false};
    context.drawImage(source,0,0,targetWidth,targetHeight);

    const outputType=mime==='image/png'?'image/webp':'image/jpeg';
    const encoded=await new Promise(resolve=>canvas.toBlob(resolve,outputType,IMAGE_ENCODE_QUALITY));
    if(!(encoded instanceof Blob)||!encoded.size)return{blob:file,width,height,compressed:false};
    const mustResize=scale<1;
    const worthUsing=mustResize||encoded.size<Number(file.size)*.92;
    if(!worthUsing)return{blob:file,width,height,compressed:false};
    return{blob:encoded,width:targetWidth,height:targetHeight,compressed:true};
  }finally{
    source?.close?.();
    sourceRelease?.();
  }
}

async function sha256Blob(blob){
  if(!(blob instanceof Blob)||!crypto?.subtle?.digest)return'';
  const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

function mediaHashesFromDescriptor(media,result){
  if(!media)return result;
  if(media.type==='image'&&media.contentHash)result.add(String(media.contentHash));
  if(media.type==='gallery'){
    for(const item of (media.items||[]))if(item?.contentHash)result.add(String(item.contentHash));
  }
  return result;
}

async function hasDuplicateImageHash(scope,contentHash){
  const hash=String(contentHash||'').toLowerCase();
  if(!hash)return false;
  const current=currentComposerScope();
  const draftItems=(current.mediaKey===scope.mediaKey&&current.ownerDraftKey===scope.ownerDraftKey)
    ?pendingAttachments
    :(ComposerDraftOwner.drafts.get(scope.ownerDraftKey)?.attachments||[]);
  if(draftItems.some(item=>item?.kind==='image'&&String(item.contentHash||'').toLowerCase()===hash))return true;

  // The visible MessageStore is a window/session, not the durable duplicate
  // authority. It remains a fast check, while MediaCache supplies the
  // conversation-scoped persistent hash index across virtual-window changes.
  if(current.mediaKey===scope.mediaKey){
    const sentHashes=new Set();
    for(const message of store.items)mediaHashesFromDescriptor(message?.media,sentHashes);
    if(sentHashes.has(hash))return true;
  }
  const cached=await window.V21MediaCache?.findByContentHash?.({
    accountId:scope.accountId,conversationId:scope.conversationId,contentHash:hash
  });
  return Boolean(cached);
}

let duplicateUploadWarningOverlay=null;
let duplicateUploadWarningReturnFocus=null;

function closeDuplicateUploadWarning({restoreFocus=true}={}){
  if(!duplicateUploadWarningOverlay)return false;
  duplicateUploadWarningOverlay.style.display='none';
  InteractionController.exit(InteractionMode.DUPLICATE_WARNING,{owner:'duplicate-upload-warning'});
  const returnFocus=duplicateUploadWarningReturnFocus;
  duplicateUploadWarningReturnFocus=null;
  if(restoreFocus&&returnFocus?.isConnected){
    requestAnimationFrame(()=>{try{returnFocus.focus({preventScroll:true});}catch{}});
  }
  return true;
}

function showDuplicateUploadWarning(){
  const lease=InteractionController.enter(InteractionMode.DUPLICATE_WARNING,{
    owner:'duplicate-upload-warning',
    lockBaseUi:true
  });
  if(!lease){
    composerHint.textContent='Bạn đã tải lên tệp này từ trước.';
    return false;
  }
  duplicateUploadWarningReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  if(!duplicateUploadWarningOverlay){
    const overlay=document.createElement('div');
    overlay.setAttribute('role','alertdialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Tệp đã tải lên');
    overlay.style.cssText='position:fixed;inset:0;z-index:20;display:none;align-items:flex-start;justify-content:center;padding:max(56px,8vh) 16px 16px;background:rgba(0,0,0,.42);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);pointer-events:auto;';
    const card=document.createElement('div');
    card.style.cssText='width:min(430px,calc(100vw - 32px));border:1px solid rgba(0,0,0,.2);border-radius:18px;background:#fff;box-shadow:0 12px 40px rgba(0,0,0,.18);padding:28px 24px 22px;text-align:center;color:#0d0d0d;font-family:system-ui,sans-serif;';
    const title=document.createElement('div');
    title.textContent='Bạn đã tải lên tệp này từ trước.';
    title.style.cssText='font-size:22px;line-height:1.25;font-weight:700;';
    const sub=document.createElement('div');
    sub.textContent='Thử tải lên nội dung mới.';
    sub.style.cssText='margin-top:14px;font-size:16px;line-height:1.35;color:#666;';
    const ok=document.createElement('button');
    ok.type='button';ok.textContent='OK';
    ok.style.cssText='margin-top:26px;width:100%;height:48px;border:0;border-radius:999px;background:#0d0d0d;color:white;font-size:16px;font-weight:600;';
    ok.addEventListener('click',()=>closeDuplicateUploadWarning());
    overlay.addEventListener('click',event=>{if(event.target===overlay)closeDuplicateUploadWarning();});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape')closeDuplicateUploadWarning();});
    card.append(title,sub,ok);overlay.appendChild(card);
    if(!globalOverlayRoot)throw new Error('DuplicateUploadWarning invariant: globalOverlayRoot missing');
    globalOverlayRoot.appendChild(overlay);
    duplicateUploadWarningOverlay=overlay;
  }
  duplicateUploadWarningOverlay.style.display='flex';
  duplicateUploadWarningOverlay.tabIndex=-1;
  duplicateUploadWarningOverlay.focus({preventScroll:true});
  return true;
}

async function warmLocalImagePreview(url){
  const src=String(url||'');
  if(!src)return false;
  const image=new Image();
  image.decoding='async';
  image.src=src;
  try{
    if(typeof image.decode==='function')await image.decode();
    else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
    return true;
  }catch(_error){
    return false;
  }
}

const IMAGE_MIME_BY_EXTENSION=Object.freeze({
  jpg:'image/jpeg',jpeg:'image/jpeg',jpe:'image/jpeg',mpo:'image/jpeg',
  png:'image/png',webp:'image/webp',gif:'image/gif',
  heic:'image/heic',heif:'image/heif',avif:'image/avif'
});

function imageMimeFromName(name){
  return IMAGE_MIME_BY_EXTENSION[fileExtension(name)]||'';
}

async function sniffImageMime(file){
  if(!(file instanceof Blob)||file.size<=0)return'';
  const bytes=new Uint8Array(await file.slice(0,32).arrayBuffer());
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';
  if(bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47)return'image/png';
  if(bytes.length>=6&&String.fromCharCode(...bytes.slice(0,6)).startsWith('GIF8'))return'image/gif';
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return'image/webp';
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(4,8))==='ftyp'){
    const brand=String.fromCharCode(...bytes.slice(8,12)).toLowerCase();
    if(brand==='avif'||brand==='avis')return'image/avif';
    if(['heic','heix','hevc','hevx'].includes(brand))return'image/heic';
    if(['mif1','msf1','heif'].includes(brand))return'image/heif';
  }
  return'';
}

async function canonicalizeImageIngressFile(file,index=0){
  if(!(file instanceof Blob))throw new Error('invalid_image');
  if(Number(file.size)<=0||Number(file.size)>15*1024*1024)throw new Error('image_too_large');
  const nativeType=String(file.type||'').split(';',1)[0].trim().toLowerCase();
  const type=(nativeType.startsWith('image/')?nativeType:'')||imageMimeFromName(file.name)||await sniffImageMime(file);
  if(!type.startsWith('image/'))throw new Error('invalid_image');
  const fallbackExtension=type==='image/png'?'png':type==='image/webp'?'webp':type==='image/gif'?'gif':type==='image/heic'?'heic':type==='image/heif'?'heif':type==='image/avif'?'avif':'jpg';
  const name=String(file.name||`image-${Date.now()}-${index+1}.${fallbackExtension}`);
  const bytes=await file.arrayBuffer();
  return new File([bytes],name,{type,lastModified:Number(file.lastModified)||Date.now()});
}

async function prepareImageAttachment(file,scope){
  if(!(file instanceof File)||!String(file.type||'').startsWith('image/'))throw new Error('invalid_image');
  const assetId=window.V21RuntimeId.create();
  const optimized=await optimizeImageBlob(file);
  const contentHash=await sha256Blob(optimized.blob);
  if(await hasDuplicateImageHash(scope,contentHash)){
    showDuplicateUploadWarning();
    throw new Error('duplicate_image');
  }
  const item={
    kind:'image',assetId,name:file.name||`image-${Date.now()}.jpg`,size:Number(optimized.blob.size)||0,
    type:optimized.blob.type||file.type||'image/jpeg',widthPx:Number(optimized.width)||null,heightPx:Number(optimized.height)||null,
    originalSize:Number(file.size)||0,optimizedSize:Number(optimized.blob.size)||0,contentHash,
    accountId:scope.accountId,conversationId:scope.conversationId,mediaDraftKey:scope.mediaKey,
    ownerDraftKey:scope.ownerDraftKey
  };
  // Persistent MediaCache is the owner. Only expose a preview after the Blob is
  // safely stored, so clipboard images cannot exist as RAM-only attachments.
  await window.V21MediaCache?.putLocal?.({
    accountId:scope.accountId,assetId,blob:optimized.blob,
    meta:{
      id:assetId,conversation_id:scope.conversationId,kind:'image',mime_type:item.type,
      size_bytes:item.size,width_px:item.widthPx,height_px:item.heightPx,content_hash:contentHash,draft:true,
      original_size_bytes:item.originalSize
    }
  });
  const previewUrl=URL.createObjectURL(optimized.blob);
  await warmLocalImagePreview(previewUrl);
  localImagePreviewUrls.set(String(assetId),previewUrl);
  return item;
}

function appendPreparedAttachment(scope,item){
  const authAccount=String(window.V21AuthSessionStore?.snapshot?.().account?.id||'');
  if(authAccount!==scope.accountId){
    releaseLocalAttachment(item,{removeCache:true});
    return false;
  }
  const current=currentComposerScope();
  if(current.mediaKey===scope.mediaKey&&ComposerDraftOwner.currentKey()===scope.ownerDraftKey){
    pendingAttachments.push(item);
    ComposerDraftOwner.saveCurrent();
    renderAttachmentTray();syncSendButtonState();
    return true;
  }
  const draft=ComposerDraftOwner.drafts.get(scope.ownerDraftKey)||{text:'',replyTarget:null,attachments:[]};
  draft.attachments=[...(draft.attachments||[]),item];
  ComposerDraftOwner.drafts.set(scope.ownerDraftKey,draft);
  return true;
}

async function ingestImageFiles(files,{scope=currentComposerScope()}={}){
  const rawFiles=Array.from(files||[]);
  if(!rawFiles.length)return{added:0,scope};
  if(!scope.accountId||!scope.conversationId||!scope.mediaKey){
    composerHint.textContent='Chưa sẵn sàng đính kèm ảnh';
    return{added:0,scope};
  }
  let added=0;
  for(const [index,rawFile] of rawFiles.entries()){
    try{
      const file=await canonicalizeImageIngressFile(rawFile,index);
      const item=await prepareImageAttachment(file,scope);
      if(appendPreparedAttachment(scope,item))added+=1;
    }catch(error){
      const message=String(error?.message||'');
      if(message==='duplicate_image')continue;
      // Only paint an error into the Composer that owns this ingest. If the
      // user switched contact while image preparation was async, the old draft
      // remains the owner and the new contact must not receive its UI error.
      console.warn('[V21 image ingress]',{
        runtime:runtimeId,
        name:String(rawFile?.name||''),
        type:String(rawFile?.type||''),
        size:Number(rawFile?.size)||0,
        error:message
      });
      if(ComposerDraftOwner.currentKey()===scope.ownerDraftKey){
        composerHint.textContent=message.includes('too_large')?'Ảnh tối đa 15 MB':'Không thể đọc ảnh này';
      }
    }
  }
  return{added,scope};
}

async function addImagesFromInput(input){
  const files=Array.from(input.files||[]);
  input.value='';
  await ingestImageFiles(files);
}

async function prepareFileAttachment(file,scope){
  if(!(file instanceof File)||!supportedFileAttachment(file))throw new Error('unsupported_file_type');
  if(Number(file.size)<=0)throw new Error('file_empty');
  if(Number(file.size)>MAX_FILE_ATTACHMENT_BYTES)throw new Error('file_too_large');
  const mimeType=canonicalFileMime(file);
  if(!mimeType)throw new Error('unsupported_file_type');
  const assetId=window.V21RuntimeId.create();
  const name=String(file.name||'Tệp').trim().slice(0,255)||'Tệp';
  const item={
    kind:'file',assetId,name,displayName:name,size:Number(file.size)||0,sizeBytes:Number(file.size)||0,
    type:mimeType,mimeType,
    accountId:scope.accountId,conversationId:scope.conversationId,mediaDraftKey:scope.mediaKey,
    ownerDraftKey:scope.ownerDraftKey
  };
  await window.V21MediaCache?.putLocal?.({
    accountId:scope.accountId,assetId,blob:file,
    meta:{
      id:assetId,conversation_id:scope.conversationId,kind:'file',mime_type:mimeType,
      size_bytes:item.sizeBytes,file_name:name,draft:true
    }
  });
  return item;
}

async function ingestFileAttachments(files,{scope=currentComposerScope()}={}){
  const rawFiles=Array.from(files||[]);
  if(!rawFiles.length)return{added:0,scope};
  if(!scope.accountId||!scope.conversationId||!scope.mediaKey){
    composerHint.textContent='Chưa sẵn sàng đính kèm tệp';
    return{added:0,scope};
  }
  const file=rawFiles[0];
  try{
    const item=await prepareFileAttachment(file,scope);
    const added=appendPreparedAttachment(scope,item)?1:0;
    if(rawFiles.length>1&&ComposerDraftOwner.currentKey()===scope.ownerDraftKey){
      composerHint.textContent='Đã thêm tệp đầu tiên · gửi lần lượt từng tệp';
    }
    return{added,scope};
  }catch(error){
    if(ComposerDraftOwner.currentKey()===scope.ownerDraftKey){
      const code=String(error?.message||'');
      composerHint.textContent=
        code==='file_too_large'?'Tệp tối đa 15 MB':
        code==='file_empty'?'Tệp trống':
        'Chỉ hỗ trợ PDF, Word, Excel, TXT, CSV';
    }
    return{added:0,scope};
  }
}

async function addFilesFromInput(input){
  const files=Array.from(input.files||[]);
  input.value='';
  await ingestFileAttachments(files);
}

async function addIOSNativeSourceFromInput(input){
  const files=Array.from(input.files||[]);
  input.value='';
  if(!files.length)return;
  const file=files[0];
  const nativeType=String(file?.type||'').split(';',1)[0].trim().toLowerCase();
  const imageCandidate=nativeType.startsWith('image/') || Boolean(imageMimeFromName(file?.name));
  if(imageCandidate){
    await ingestImageFiles([file]);
    return;
  }
  if(supportedFileAttachment(file)){
    await ingestFileAttachments([file]);
    return;
  }
  composerHint.textContent='Chỉ hỗ trợ ảnh, PDF, Word, Excel, TXT, CSV';
}


function formatAudioClock(seconds){
  const total=Math.max(0,Math.floor(Number(seconds)||0));
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

function appendAudioWaveform(target,{seconds=0,count=22}={}){
  for(let n=0;n<count;n++){
    const bar=document.createElement('i');
    bar.style.height=`${6+((n*7+Math.max(1,seconds)*3)%16)}px`;
    target.appendChild(bar);
  }
}


function updateAudioWaveform(target,{seconds=0}={}){
  const bars=Array.from(target?.children||[]);
  for(const [n,bar] of bars.entries()){
    bar.style.height=`${6+((n*7+Math.max(1,seconds)*3)%16)}px`;
  }
}

function updateRecordingSurface(card){
  if(!card)return;
  card.dataset.audioRecordingState=audioWorkflowState;
  const seconds=Math.max(0,Math.floor((Date.now()-recordingStartedAt)/1000));
  const waveform=card.querySelector('.audio-recording-waveform');
  updateAudioWaveform(waveform,{seconds});
  const time=card.querySelector('[data-audio-recording-time]');
  if(time){
    if(audioWorkflowState==='REQUESTING_PERMISSION')time.textContent='Đang mở mic…';
    else if(audioWorkflowState==='STOPPING')time.textContent='Đang xử lý…';
    else time.textContent=formatAudioClock(seconds);
  }
  const cancel=card.querySelector('.audio-recording-cancel');
  if(cancel)cancel.disabled=audioWorkflowState!=='RECORDING';
  const stop=card.querySelector('.audio-recording-stop');
  if(stop){
    stop.textContent=audioWorkflowState==='STOPPING'?'Đang xử lý…':'Dừng';
    stop.disabled=audioWorkflowState!=='RECORDING';
  }
}

function renderRecordingSurface(){
  let card=attachmentTray.querySelector('[data-audio-recording-surface]');
  if(card){
    updateRecordingSurface(card);
    return false;
  }

  card=document.createElement('div');
  card.className='audio-recording-card';
  card.dataset.audioRecordingSurface='true';

  const indicator=document.createElement('span');
  indicator.className='audio-recording-indicator';
  const dot=document.createElement('i');
  dot.className='audio-recording-dot';
  indicator.appendChild(dot);

  const main=document.createElement('span');
  main.className='audio-recording-main';
  const waveform=document.createElement('span');
  waveform.className='audio-recording-waveform';
  waveform.setAttribute('aria-hidden','true');
  appendAudioWaveform(waveform,{seconds:0,count:24});
  const time=document.createElement('span');
  time.className='audio-recording-time';
  time.dataset.audioRecordingTime='true';
  main.append(waveform,time);

  const cancel=document.createElement('button');
  cancel.type='button';
  cancel.className='audio-recording-cancel';
  cancel.textContent='Hủy';
  cancel.addEventListener('pointerdown',event=>event.stopPropagation());
  cancel.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    if(audioWorkflowState==='RECORDING')stopRecording({discard:true});
  });

  const stop=document.createElement('button');
  stop.type='button';
  stop.className='audio-recording-stop';
  stop.addEventListener('pointerdown',event=>event.stopPropagation());
  stop.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    if(audioWorkflowState==='RECORDING')stopRecording();
  });

  card.append(indicator,main,cancel,stop);
  attachmentTray.appendChild(card);
  updateRecordingSurface(card);
  return true;
}

function renderAttachmentTray(){
  attachmentTray.classList.add('attachment-tray-media-strip');

  if(['REQUESTING_PERMISSION','RECORDING','STOPPING'].includes(audioWorkflowState)){
    attachmentTray.dataset.layout='audio';
    const created=renderRecordingSurface();
    if(created)requestAnimationFrame(publishComposerHeight);
    return;
  }

  attachmentTray.replaceChildren();

  const hasAudio=pendingAttachments.some(item=>item?.kind==='audio');
  attachmentTray.dataset.layout=hasAudio?'audio':'strip';

  for(const [index,item] of pendingAttachments.entries()){
    const chip=document.createElement('div');
    chip.className=item?.kind==='image'?'attachment-chip attachment-image-chip shrink-0':'attachment-chip shrink-0';
    if(item?.kind==='image')chip.dataset.attachmentAssetId=String(item.assetId||'');

    if(item?.kind==='image'){
      const preview=document.createElement('button');
      preview.type='button';
      preview.className='attachment-image-preview';
      preview.setAttribute('aria-label','Xem trước ảnh');
      preview.style.cssText='width:100%;height:100%;border:0;border-radius:inherit;overflow:hidden;padding:0;background:#e2e8f0;display:block;cursor:pointer;';
      const img=document.createElement('img');
      img.alt='';
      img.draggable=false;
      img.style.cssText='width:100%;height:100%;object-fit:cover;display:block;';
      const previewUrl=localImagePreviewUrls.get(String(item.assetId||''));
      if(previewUrl)img.src=previewUrl;
      preview.appendChild(img);
      preview.addEventListener('click',()=>{
        void openImageViewer({assetId:item.assetId,accountId:item.accountId,previewUrl:previewUrl||''});
      });
      chip.appendChild(preview);
    }else if(item?.kind==='audio'){
      chip.className='audio-preview-card shrink-0';
      chip.dataset.audioPreviewAssetId=String(item.assetId||'');
      const play=document.createElement('button');
      play.type='button';
      play.className='audio-preview-play';
      play.textContent='▶';
      play.setAttribute('aria-label','Phát ghi âm');
      const audio=document.createElement('audio');
      audio.preload='metadata';
      const previewUrl=localAudioPreviewUrls.get(String(item.assetId||''));
      if(previewUrl)audio.src=previewUrl;

      const seconds=Math.max(0,Number(item.durationSeconds)||Math.round((Number(item.durationMs)||0)/1000));
      const waveform=document.createElement('span');
      waveform.className='audio-preview-waveform';
      waveform.setAttribute('aria-hidden','true');
      appendAudioWaveform(waveform,{seconds,count:24});

      const duration=document.createElement('span');
      duration.className='audio-preview-duration';
      const updatePreviewTime=()=>{
        const current=Math.min(seconds,Math.max(0,Math.floor(Number(audio.currentTime)||0)));
        duration.textContent=`${formatAudioClock(current)} / ${formatAudioClock(seconds)}`;
      };
      updatePreviewTime();

      play.addEventListener('click',()=>{
        void toggleAudioPlayback(chip,audio,{
          accountId:item.accountId,
          assetId:item.assetId
        },{button:play});
      });
      audio.addEventListener('play',()=>{
        AudioPlaybackController.claim(audio);
        play.textContent='❚❚';play.setAttribute('aria-label','Tạm dừng ghi âm');
      });
      audio.addEventListener('pause',()=>{
        AudioPlaybackController.release(audio);
        play.textContent='▶';play.setAttribute('aria-label','Phát ghi âm');
      });
      audio.addEventListener('ended',()=>{
        AudioPlaybackController.release(audio);
        play.textContent='▶';audio.currentTime=0;updatePreviewTime();
      });
      audio.addEventListener('timeupdate',updatePreviewTime);

      const actions=document.createElement('span');
      actions.className='audio-preview-actions';
      const cancel=document.createElement('button');
      cancel.type='button';cancel.className='audio-preview-cancel';cancel.textContent='Hủy';
      cancel.disabled=audioWorkflowState==='SENDING';
      cancel.addEventListener('pointerdown',event=>{event.stopPropagation();});
      cancel.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        const idx=pendingAttachments.findIndex(x=>String(x?.assetId||'')===String(item.assetId||''));
        if(idx>=0)pendingAttachments.splice(idx,1);
        releaseLocalAudioAttachment(item,{removeCache:true});
        ComposerDraftOwner.saveCurrent();
        setAudioWorkflowState('IDLE');
        renderAttachmentTray();
        syncSendButtonState();
      });
      const sendAudio=document.createElement('button');
      sendAudio.type='button';sendAudio.className='audio-preview-send';
      sendAudio.textContent=audioWorkflowState==='SENDING'?'Đang gửi…':'Gửi';
      sendAudio.disabled=audioWorkflowState==='SENDING';
      sendAudio.setAttribute('aria-label','Gửi ghi âm');
      sendAudio.addEventListener('pointerdown',event=>{event.stopPropagation();});
      sendAudio.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        if(audioWorkflowState!=='SENDING')void sendAudioAttachment(item);
      });
      actions.append(cancel,sendAudio);
      chip.append(play,waveform,duration,actions,audio);
      attachmentTray.appendChild(chip);
      continue;
    }else{
      const label=document.createElement('span');
      label.className='min-w-0 max-w-[220px] truncate';
      label.textContent=
        item.displayName
          ?`${item.displayName} · ${formatBytes(item.size)}`
          :`${item.name} · ${formatBytes(item.size)}`;
      chip.appendChild(label);
    }

    const remove=document.createElement('button');
    remove.type='button';
    if(item?.kind==='image'){
      remove.className='attachment-image-remove';
      remove.appendChild(viewerIconSvg('close'));
    }else{
      remove.className='shrink-0 rounded-full px-1 text-slate-500 hover:bg-slate-200';
      remove.style.cssText='display:grid;place-items:center;width:1.75rem;height:1.75rem;padding:0;line-height:0;';
      const removeIcon=viewerIconSvg('close');
      removeIcon.style.width='1rem';
      removeIcon.style.height='1rem';
      remove.appendChild(removeIcon);
    }
    remove.setAttribute('aria-label',`Bỏ ${item.name}`);
    remove.addEventListener('click',()=>{
      const [removed]=pendingAttachments.splice(index,1);
      if(removed?.assetId)releaseLocalAttachment(removed,{removeCache:true});
      ComposerDraftOwner.saveCurrent();
      renderAttachmentTray();
      syncSendButtonState();
      publishComposerHeight();
    });

    chip.appendChild(remove);
    attachmentTray.appendChild(chip);
  }

  requestAnimationFrame(publishComposerHeight);
}

replyContextClose.addEventListener('click',event=>{
  event.preventDefault();
  clearReplyTarget();
  editor.focus({preventScroll:true});
});

const supportsPopoverApi=
  typeof actionMenu?.showPopover==='function' &&
  typeof actionMenu?.hidePopover==='function';

function placeComposerActionMenu(){
  const rect=plusButton.getBoundingClientRect();
  const viewportLeft=vv?.offsetLeft||0;
  const viewportTop=vv?.offsetTop||0;
  const viewportWidth=vv?.width||window.innerWidth;
  const viewportHeight=vv?.height||window.innerHeight;

  const menuRect=actionMenu.getBoundingClientRect();
  const menuWidth=
    menuRect.width ||
    Math.min(224,viewportWidth-24);
  const menuHeight=menuRect.height||156;

  const left=Math.max(
    viewportLeft+12,
    Math.min(
      viewportLeft+viewportWidth-menuWidth-12,
      rect.left-7
    )
  );

  // Always place the app-owned menu ABOVE the Composer button. This avoids
  // Safari's bottom address bar and keeps Android/Desktop on the same contract.
  const top=Math.max(
    viewportTop+12,
    Math.min(
      viewportTop+viewportHeight-menuHeight-12,
      rect.top-menuHeight-8
    )
  );

  actionMenu.style.left=`${left}px`;
  actionMenu.style.top=`${top}px`;
  actionMenu.style.right='auto';
  actionMenu.style.bottom='auto';
}

function isComposerActionMenuOpen(){
  return supportsPopoverApi?actionMenu.matches(':popover-open'):actionMenu.dataset.fallbackOpen==='true';
}

function setComposerActionMenuOpen(open){
  open=Boolean(open);
  if(open&&InteractionController.snapshot().mode!==InteractionMode.NONE)return;

  if(open===isComposerActionMenuOpen())return;

  plusButton.dataset.state=open?'open':'closed';

  if(open){
    actionMenu.style.visibility='hidden';
    if(supportsPopoverApi)actionMenu.showPopover();
    else actionMenu.dataset.fallbackOpen='true';
    placeComposerActionMenu();
    actionMenu.style.visibility='visible';
  }else{
    if(supportsPopoverApi)actionMenu.hidePopover();
    else delete actionMenu.dataset.fallbackOpen;
    actionMenu.style.removeProperty('visibility');
  }
}

function toggleComposerActionMenu(){
  setComposerActionMenuOpen(
    !isComposerActionMenuOpen()
  );
}

if(supportsPopoverApi)actionMenu.addEventListener('toggle',()=>{
  plusButton.dataset.state=
    isComposerActionMenuOpen()
      ?'open'
      :'closed';
});

plusButton.addEventListener('pointerdown',event=>{
  if(document.activeElement===editor)event.preventDefault();
});
const cameraActionButton=actionMenu.querySelector('[data-upload-kind="camera"]');
if(cameraActionButton){
  cameraActionButton.hidden=RuntimeProfile.pickerMode!=='app-3';
}

plusButton.addEventListener('click',event=>{
  event.preventDefault();
  event.stopPropagation();

  // iOS already provides one native source sheet (Camera / Photo Library /
  // Files). Showing the app menu first duplicates the same decision and may
  // place choices under Safari's bottom address bar.
  if(RuntimeProfile.pickerMode==='ios-native'){
    setComposerActionMenuOpen(false);
    const opened=openNativeFilePicker(uploadIOSSourceInput);
    if(!opened)composerHint.textContent='Không thể mở bộ chọn tệp';
    return;
  }

  // Android keeps the explicit 3-item app menu because its generic input may
  // expose Camera/Camcorder/Files. Desktop keeps only Image/File.
  toggleComposerActionMenu();
});

function openNativeFilePicker(input){
  if(!(input instanceof HTMLInputElement))return false;
  // The picker call must remain inside the original user activation. Closing a
  // popover first can consume/retarget that activation on Safari/Chrome mobile.
  try{
    if(typeof input.showPicker==='function'){
      input.showPicker();
      return true;
    }
  }catch(_showPickerError){}
  try{
    input.click();
    return true;
  }catch(_clickError){
    return false;
  }
}

for(const button of actionMenu.querySelectorAll('[data-upload-kind]')){
  button.addEventListener('pointerdown',event=>event.stopPropagation());
  button.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    const kind=button.dataset.uploadKind;
    const input=kind==='camera'?uploadCameraInput:kind==='photos'?uploadPhotosInput:uploadInput;
    const opened=openNativeFilePicker(input);
    setComposerActionMenuOpen(false);
    if(!opened)composerHint.textContent='Không thể mở bộ chọn tệp';
  });
}

uploadInput.addEventListener('change',()=>{void addFilesFromInput(uploadInput);});
uploadPhotosInput.addEventListener('change',()=>{void addImagesFromInput(uploadPhotosInput);});
uploadCameraInput.addEventListener('change',()=>{void addImagesFromInput(uploadCameraInput);});
uploadIOSSourceInput?.addEventListener('change',()=>{void addIOSNativeSourceFromInput(uploadIOSSourceInput);});

window.addEventListener('resize',()=>{
  if(isComposerActionMenuOpen())placeComposerActionMenu();
});
vv?.addEventListener('resize',()=>{
  if(isComposerActionMenuOpen())placeComposerActionMenu();
},{passive:true});
vv?.addEventListener('scroll',()=>{
  if(isComposerActionMenuOpen())placeComposerActionMenu();
},{passive:true});

function stopRecordingTimer(){
  clearInterval(recordingTimer);
  recordingTimer=0;
  renderComposerModeHint();
}

function setRecordingUi(active){
  micButton.dataset.recording=
    active?'true':'false';
  micButton.setAttribute(
    'aria-label',
    active?'Dừng ghi âm':'Bắt đầu ghi âm'
  );
  syncSendButtonState();
}

function recordingExtensionForMime(mime){
  const value=String(mime||'').toLowerCase();
  if(value.includes('mp4')||value.includes('aac'))return 'm4a';
  if(value.includes('ogg'))return 'ogg';
  if(value.includes('webm'))return 'webm';
  return 'audio';
}


async function readAudioDurationMs(blob,{timeoutMs=1800}={}){
  if(!(blob instanceof Blob)||blob.size<=0)return null;
  const url=URL.createObjectURL(blob);
  const audio=document.createElement('audio');
  audio.preload='metadata';
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      audio.removeAttribute('src');
      try{audio.load();}catch{}
      URL.revokeObjectURL(url);
      const numeric=Number(value);
      resolve(Number.isFinite(numeric)&&numeric>0?Math.max(1,Math.round(numeric*1000)):null);
    };
    const inspect=()=>{
      const duration=Number(audio.duration);
      if(Number.isFinite(duration)&&duration>0)finish(duration);
    };
    const timer=setTimeout(()=>finish(null),Math.max(400,Number(timeoutMs)||1800));
    audio.addEventListener('loadedmetadata',inspect,{once:true});
    audio.addEventListener('durationchange',inspect);
    audio.addEventListener('error',()=>finish(null),{once:true});
    audio.src=url;
  });
}

async function startRecording(){
  clearComposerMediaError();
  if(
    !audioCapturePolicy()?.acquire ||
    typeof MediaRecorder==='undefined'
  ){
    composerHint.textContent='Trình duyệt không hỗ trợ ghi âm';
    return;
  }

  if(pendingAttachments.some(item=>item?.kind==='audio')){
    composerHint.textContent='Hủy hoặc gửi bản ghi hiện tại trước';
    return;
  }
  const recordingScope=currentComposerScope();
  if(recordingScope.state!=='READY'){
    composerHint.textContent='Đoạn chat đang khởi tạo';
    return;
  }
  setAudioWorkflowState('REQUESTING_PERMISSION');
  renderAttachmentTray();
  const interactionLease=InteractionController.enter(InteractionMode.AUDIO_RECORDING,{
    owner:'audio-recorder',
    lockBaseUi:false
  });
  if(!interactionLease){
    setAudioWorkflowState('ERROR');
    composerHint.textContent='Đóng tác vụ hiện tại trước khi ghi âm';
    setAudioWorkflowState('IDLE');
    renderAttachmentTray();
    return;
  }

  try{
    const requestedDraftKey=ComposerDraftOwner.currentKey();
    const requestedScope=currentComposerScope();
    const acquiredStream=await audioCapturePolicy().acquire({
      owner:'audio-recorder',
      purpose:'recording'
    });

    if(
      requestedDraftKey!==ComposerDraftOwner.currentKey() ||
      !InteractionController.isLeaseCurrent(interactionLease)
    ){
      audioCapturePolicy()?.release?.(acquiredStream,{owner:'audio-recorder'});
      InteractionController.exit(InteractionMode.AUDIO_RECORDING,{owner:'audio-recorder'});
      setAudioWorkflowState('IDLE');
      renderAttachmentTray();
      return;
    }

    mediaStream=acquiredStream;
    recordingDraftKey=requestedDraftKey;
    recordingOwnerScope={...requestedScope};
    discardRecordingOnStop=false;
    mediaChunks=[];
    mediaRecorder=new MediaRecorder(mediaStream);
    recordingStartedAt=Date.now();

    mediaRecorder.addEventListener('dataavailable',event=>{
      if(event.data && event.data.size){
        mediaChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener('stop',async()=>{
      const recorderMime=mediaRecorder?.mimeType||'audio/webm';
      const blob=new Blob(mediaChunks,{type:recorderMime});
      const durationMs=await readAudioDurationMs(blob);
      const durationSeconds=durationMs==null?null:durationMs/1000;
      const shouldKeep=
        !discardRecordingOnStop &&
        recordingDraftKey===ComposerDraftOwner.currentKey();
      let settledAudioState=shouldKeep?'PREVIEW':'IDLE';

      if(shouldKeep&&recordingOwnerScope?.accountId){
        try{
          const ext=recordingExtensionForMime(blob.type||recorderMime);
          const assetId=window.V21RuntimeId.create();
          const item={
            kind:'audio',assetId,
            accountId:String(recordingOwnerScope.accountId),
            contactId:String(recordingOwnerScope.contactId||''),
            conversationId:String(recordingOwnerScope.conversationId||''),
            mediaDraftKey:String(recordingOwnerScope.mediaKey||''),
            ownerDraftKey:String(recordingOwnerScope.ownerDraftKey||recordingDraftKey||''),
            name:`recording-${Date.now()}.${ext}`,
            displayName:durationMs==null?'Ghi âm':`Ghi âm · ${formatAudioClock(durationSeconds)}`,
            durationSeconds,durationMs,
            size:blob.size,type:blob.type||recorderMime,blob
          };
          await window.V21MediaCache?.putLocal?.({
            accountId:item.accountId,assetId,blob,
            meta:{kind:'audio',contact_id:item.contactId,conversation_id:item.conversationId||null,duration_ms:item.durationMs,draft_key:item.ownerDraftKey}
          });
          const previewUrl=URL.createObjectURL(blob);
          localAudioPreviewUrls.set(assetId,previewUrl);
          pendingAttachments.push(item);
          ComposerDraftOwner.saveCurrent();
          settledAudioState='PREVIEW';
        }catch(error){
          console.error('[V21 audio preview cache]',error);
          composerHint.textContent='Không thể tạo bản xem trước ghi âm';
          settledAudioState='ERROR';
        }
      }

      // Recording interaction owns only microphone capture. Release that owner
      // completely before exposing PREVIEW so pointer/send state cannot inherit
      // a stale AUDIO_RECORDING lease or STOPPING geometry.
      if(mediaStream)audioCapturePolicy()?.release?.(mediaStream,{owner:'audio-recorder'});
      mediaStream=null;
      mediaRecorder=null;
      mediaChunks=[];
      recordingDraftKey=null;
      recordingOwnerScope=null;
      discardRecordingOnStop=false;
      stopRecordingTimer();
      InteractionController.exit(InteractionMode.AUDIO_RECORDING,{owner:'audio-recorder'});
      setRecordingUi(false);
      setAudioWorkflowState(settledAudioState);
      renderAttachmentTray();
      syncSendButtonState();
    });

    mediaRecorder.start();
    setAudioWorkflowState('RECORDING');
    setRecordingUi(true);
    renderAttachmentTray();

    const updateTimer=()=>{
      const seconds=Math.max(
        0,
        Math.floor((Date.now()-recordingStartedAt)/1000)
      );
      const surface=attachmentTray.querySelector('[data-audio-recording-surface]');
      const label=surface?.querySelector?.('[data-audio-recording-time]');
      if(label)label.textContent=formatAudioClock(seconds);
      updateAudioWaveform(surface?.querySelector?.('.audio-recording-waveform'),{seconds});
    };

    updateTimer();
    recordingTimer=setInterval(updateTimer,500);
  }catch(error){
    if(mediaStream)audioCapturePolicy()?.release?.(mediaStream,{owner:'audio-recorder'});
    mediaStream=null;
    mediaRecorder=null;
    setRecordingUi(false);
    stopRecordingTimer();
    composerHint.textContent='Không thể mở micro';
    setAudioWorkflowState('ERROR');
    InteractionController.exit(InteractionMode.AUDIO_RECORDING,{owner:'audio-recorder'});
    setAudioWorkflowState('IDLE');
    renderAttachmentTray();
    console.warn('Micro unavailable',error);
  }
}

function stopRecording({discard=false}={}){
  if(discard)discardRecordingOnStop=true;
  setAudioWorkflowState('STOPPING');
  renderAttachmentTray();
  if(
    mediaRecorder &&
    mediaRecorder.state!=='inactive'
  ){
    mediaRecorder.stop();
  }
}

micButton.addEventListener('pointerdown',event=>{
  if(document.activeElement===editor){
    event.preventDefault();
  }
});
micButton.addEventListener('click',()=>{
  if(
    mediaRecorder &&
    mediaRecorder.state==='recording'
  ){
    stopRecording();
  }else{
    startRecording();
  }
});

document.addEventListener('v21-interaction-abort',()=>{
  setComposerActionMenuOpen(false);
  if(imageViewerOverlay?.open)closeImageViewer({restoreFocus:false});
  if(duplicateUploadWarningOverlay?.style.display==='flex'){
    closeDuplicateUploadWarning({restoreFocus:false});
  }
  if(mediaRecorder&&mediaRecorder.state!=='inactive'){
    stopRecording({discard:true});
  }else if(mediaStream){
    audioCapturePolicy()?.release?.(mediaStream,{owner:'audio-recorder'});
    mediaStream=null;
    InteractionController.exit(InteractionMode.AUDIO_RECORDING,{owner:'audio-recorder'});
  }
});

/* =========================================================
   IME + SEND
   ========================================================= */
let composing=false;
let sendLocked=false;

editor.addEventListener('compositionstart',()=>{
  composing=true;
  syncSendButtonState();
});
editor.addEventListener('compositionupdate',()=>{
  requestAnimationFrame(syncSendButtonState);
});
editor.addEventListener('compositionend',()=>{
  composing=false;
  autoGrow({source:'typing'});
  ComposerDraftOwner.saveCurrent();
  syncSendButtonState();
});
editor.addEventListener('input',()=>{
  autoGrow({source:'typing'});
  ComposerDraftOwner.saveCurrent();
  syncSendButtonState();
});

function canSendFromComposer(){
  return Boolean(
    editor.value.length>0 ||
    pendingAttachments.length
  );
}

function syncSendButtonState(){
  const hasPayload=canSendFromComposer();
  const recording=Boolean(
    (mediaRecorder&&mediaRecorder.state==='recording') ||
    audioWorkflowState==='REQUESTING_PERMISSION' ||
    audioWorkflowState==='STOPPING' ||
    audioWorkflowState==='SENDING'
  );
  const visualCanSend=
    hasPayload &&
    !sendLocked &&
    !recording;

  const interactiveCanSend=
    visualCanSend &&
    !composing;

  const modeToggleAvailable=
    !hasPayload &&
    !sendLocked &&
    !composing &&
    !recording;

  const arrow=
    composerSendMode==='button'
      ?'up'
      :'right';

  // Two deliberate keyboard contracts only:
  // button mode: Return newline, Return again on blank line sends.
  // enter mode: Return sends, Shift+Return newline.
  composerShell.dataset.sendMode=composerSendMode;
  editor.enterKeyHint=composerSendMode==='enter'?'send':'enter';

  composerShell.dataset.canSend=
    visualCanSend?'true':'false';
  sendButton.dataset.arrow=arrow;
  sendButton.dataset.modeToggle=
    modeToggleAvailable?'true':'false';
  sendButton.disabled=
    !(interactiveCanSend || modeToggleAvailable);
  sendButton.setAttribute(
    'aria-disabled',
    sendButton.disabled?'true':'false'
  );
  sendButton.setAttribute(
    'aria-label',
    hasPayload
      ?'Gửi tin nhắn'
      :composerSendMode==='button'
        ?'Đổi sang Return gửi'
        :'Đổi sang Return xuống dòng'
  );
  renderComposerModeHint();
}

function toggleComposerSendMode(){
  if(
    canSendFromComposer() ||
    sendLocked ||
    composing ||
    (mediaRecorder && mediaRecorder.state==='recording')
  )return false;

  composerSendMode=
    composerSendMode==='button'
      ?'enter'
      :'button';
  persistComposerSendMode();
  syncSendButtonState();
  return true;
}

function mediaDescriptorFromAttachment(item){
  const kind=String(item?.kind||'file').toLowerCase();
  const accountId=String(item?.accountId||currentMediaAccountId()||'');
  const mimeType=String(item?.type||item?.mimeType||'').toLowerCase();
  if(kind==='image'){
    const width=Number(item?.widthPx)||null;
    const height=Number(item?.heightPx)||null;
    return{
      type:'image',kind:'image',assetId:String(item?.assetId||''),accountId,
      width,height,aspectRatio:width>0&&height>0?width/height:null,
      mimeType,sizeBytes:Number(item?.sizeBytes??item?.size)||0,contentHash:item?.contentHash||null,
      status:'sending',sortIndex:Number(item?.sortIndex)||0
    };
  }
  if(kind==='audio'){
    return{
      type:'file',kind:'audio',assetId:String(item?.assetId||''),accountId,
      name:item?.name||'recording',displayName:item?.displayName||'Ghi âm',
      durationSeconds:Number(item?.durationSeconds)||null,durationMs:Number(item?.durationMs)||null,
      size:Number(item?.sizeBytes??item?.size)||0,mimeType:mimeType||'audio/webm',status:'sending',
      sortIndex:Number(item?.sortIndex)||0
    };
  }
  return{
    type:'file',kind:'file',assetId:String(item?.assetId||''),accountId,
    name:item?.name||'file',displayName:item?.displayName||item?.name||'Tệp',
    size:Number(item?.sizeBytes??item?.size)||0,mimeType,status:'sending',sortIndex:Number(item?.sortIndex)||0
  };
}

function mediaDescriptorFromAttachments(items){
  const media=(Array.isArray(items)?items:[]).map((item,index)=>mediaDescriptorFromAttachment({...item,sortIndex:index}));
  if(!media.length)return null;
  if(media.length===1)return media[0];
  if(media.every(item=>item?.kind==='image'))return{type:'gallery',kind:'image-gallery',items:media,status:'sending'};
  // Current renderer intentionally supports multi-image galleries and a single
  // non-image attachment. Transport remains generic; unsupported mixed UI is
  // rejected before queueing rather than inventing a second transport path.
  return{type:'file',kind:'file',displayName:`${media.length} tệp`,items:media,status:'sending'};
}

function promoteSentImagePreviewOwnership(imageAttachments){
  for(const item of (Array.isArray(imageAttachments)?imageAttachments:[])){
    const assetId=String(item?.assetId||'');
    const accountId=String(item?.accountId||'');
    if(!assetId||!accountId)continue;
    const previewUrl=localImagePreviewUrls.get(assetId);
    if(!previewUrl)continue;
    const cacheKey=`${accountId}::${assetId}`;
    const existing=mediaObjectUrls.get(cacheKey);
    if(existing&&existing!==previewUrl)URL.revokeObjectURL(previewUrl);
    else if(!existing)mediaObjectUrls.set(cacheKey,previewUrl);
    localImagePreviewUrls.delete(assetId);
  }
}

function promoteSentAudioPreviewOwnership(item){
  const assetId=String(item?.assetId||'');
  const accountId=String(item?.accountId||'');
  if(!assetId||!accountId)return false;
  const previewUrl=localAudioPreviewUrls.get(assetId);
  if(!previewUrl)return false;
  const cacheKey=`${accountId}::${assetId}`;
  const existing=mediaObjectUrls.get(cacheKey);
  if(existing&&existing!==previewUrl)URL.revokeObjectURL(previewUrl);
  else if(!existing)mediaObjectUrls.set(cacheKey,previewUrl);
  localAudioPreviewUrls.delete(assetId);
  return true;
}

function commitComposerSnapshotAfterSend({rawText='',sentAttachmentIds=[],replyId=null,attachments=[],anchorMessageId=null}={}){
  // Own-send is an explicit UI intent to reveal the just-appended logical
  // message. Claim FOLLOW_TAIL before clearing/shrinking the Composer so any
  // browser layout scroll produced by that geometry change cannot restore the
  // old reading position. The actual tail write happens only AFTER render.
  claimTailIntent('own-send',{messageId:anchorMessageId||''});
  promoteSentMediaPreviewOwnership(attachments);
  const sentIds=new Set((sentAttachmentIds||[]).map(String));
  if(editor.value===String(rawText||''))editor.value='';
  if(sentIds.size){
    pendingAttachments=pendingAttachments.filter(item=>!sentIds.has(String(item?.assetId||'')));
  }else{
    pendingAttachments=[];
  }
  if(!replyId||String(replyTarget?.id||'')===String(replyId))clearReplyTarget();
  if(editor.value||pendingAttachments.length||replyTarget)ComposerDraftOwner.saveCurrent();
  else ComposerDraftOwner.commitEmptyCurrent();
  renderAttachmentTray();
  autoGrow({source:'send'});
  renderWindow({preserve:'AUTO'});
  // One TAIL transaction owns both the logical bottom and the just-sent target.
  // Late image/media/Composer geometry will re-enter through the same policy.
  scrollToTail('own-send',{messageId:anchorMessageId||''});
}

function promoteSentMediaPreviewOwnership(attachments){
  for(const item of (Array.isArray(attachments)?attachments:[])){
    if(item?.kind==='image')promoteSentImagePreviewOwnership([item]);
    else if(item?.kind==='audio')promoteSentAudioPreviewOwnership(item);
  }
}

function commitInactiveMediaDraftAfterSend({sendScope,rawText='',attachments=[],replyId=null}={}){
  const key=String(sendScope?.ownerDraftKey||'');
  if(!key)return false;
  const draft=ComposerDraftOwner.drafts.get(key)||null;
  if(!draft)return false;
  promoteSentMediaPreviewOwnership(attachments);
  const sentIds=new Set((attachments||[]).map(item=>String(item?.assetId||'')).filter(Boolean));
  const next={
    text:String(draft.text||'')===String(rawText||'')?'':String(draft.text||''),
    replyTarget:(!replyId||String(draft.replyTarget?.id||'')===String(replyId))?null:draft.replyTarget,
    attachments:(draft.attachments||[]).filter(item=>!sentIds.has(String(item?.assetId||'')))
  };
  if(ComposerDraftOwner.isEmpty(next))ComposerDraftOwner.drafts.delete(key);
  else ComposerDraftOwner.drafts.set(key,next);
  return true;
}

function mediaQueueAssetsFromAttachments(attachments){
  return (Array.isArray(attachments)?attachments:[]).map((item,index)=>({
    kind:String(item?.kind||'file').toLowerCase(),
    assetId:item?.assetId,
    accountId:item?.accountId,
    conversationId:item?.conversationId||null,
    mimeType:item?.type||item?.mimeType||'',
    sizeBytes:Number(item?.sizeBytes??item?.size)||0,
    widthPx:Number(item?.widthPx)||null,
    heightPx:Number(item?.heightPx)||null,
    durationMs:Number(item?.durationMs)||Number(item?.durationSeconds)*1000||null,
    contentHash:item?.contentHash||null,
    fileName:item?.kind==='file'?String(item?.name||item?.displayName||'Tệp').slice(0,255):null,
    sortIndex:index
  }));
}

async function commitMediaSendTransaction({rawText,text,attachments,replyPayload,realtimeStore,sendScope}={}){
  const list=Array.isArray(attachments)?attachments.filter(Boolean):[];
  if(!list.length)return false;
  const hasAudio=list.some(item=>item?.kind==='audio');
  const hasNonImage=list.some(item=>item?.kind!=='image');
  if(hasNonImage&&list.length>1){
    sendLocked=false;syncSendButtonState();
    composerHint.textContent='Hãy gửi từng bản ghi/tệp riêng';
    return false;
  }

  const now=Date.now();
  const clientId=`client-${now}-${++seq}`;
  const optimistic=createMessage({
    id:clientId,clientId,text,sender:'self',status:'sending',createdAt:now,
    replyTo:replyPayload,media:mediaDescriptorFromAttachments(list)
  });
  if(hasAudio){setAudioWorkflowState('SENDING');renderAttachmentTray();}

  try{
    if(!realtimeStore?.isReady?.())throw new Error('conversation_not_ready');
    const queuedRow=await realtimeStore.sendMedia({
      clientId,text,
      contactId:sendScope?.contactId||null,
      conversationId:sendScope?.conversationId||null,
      assets:mediaQueueAssetsFromAttachments(list),
      reply:replyPayload
    });

    const currentScope=currentComposerScope();
    const sentIds=new Set(list.map(item=>String(item?.assetId||'')).filter(Boolean));
    const stillOwnsVisibleComposer=
      currentScope.accountId===String(sendScope?.accountId||'')&&
      list.every(sent=>pendingAttachments.some(item=>
        String(item?.assetId||'')===String(sent?.assetId||'')&&
        sentIds.has(String(item?.assetId||''))&&
        attachmentBelongsToComposerScope(item,sendScope)
      ));

    if(stillOwnsVisibleComposer){
      promoteSentMediaPreviewOwnership(list);
      store.appendBatch([optimistic]);
      commitComposerSnapshotAfterSend({
        rawText,
        sentAttachmentIds:list.map(item=>item.assetId),
        replyId:replyPayload?.id||null,
        attachments:list,
        anchorMessageId:optimistic.id
      });
      if(hasAudio){setAudioWorkflowState('IDLE');renderAttachmentTray();}
    }else{
      realtimeStore.mergeForContact?.(queuedRow,{
        contactId:sendScope?.contactId||null,
        conversationId:sendScope?.conversationId||queuedRow?.conversation_id||null
      });
      commitInactiveMediaDraftAfterSend({
        sendScope,rawText,attachments:list,replyId:replyPayload?.id||null
      });
    }
    void window.V21SyncEngine?.wake?.({reason:'media-outbox-committed'});
    return true;
  }catch(error){
    console.error('[V21 media send transaction]',error);
    if(currentComposerScope().ownerDraftKey===sendScope?.ownerDraftKey){
      composerHint.textContent=runtimeErrorMessage(error)||'Chưa thể xếp hàng gửi tệp';
      if(hasAudio){setAudioWorkflowState('PREVIEW');renderAttachmentTray();}
    }
    return false;
  }finally{
    requestAnimationFrame(()=>{
      if(
        currentComposerScope().ownerDraftKey===sendScope?.ownerDraftKey &&
        audioWorkflowState==='IDLE' &&
        document.activeElement!==editor &&
        shouldRestoreEditorFocusAfterAction()
      ){
        editor.focus({preventScroll:true});
      }
      sendLocked=false;syncSendButtonState();
    });
  }
}


async function sendAudioAttachment(item){
  clearComposerMediaError();
  if(sendLocked||audioWorkflowState==='SENDING')return false;
  if(!item||item.kind!=='audio')return false;

  const sendScope=currentComposerScope();
  const scopeMismatch=sendScope.state!=='READY'||!attachmentBelongsToComposerScope(item,sendScope);
  if(scopeMismatch){
    composerHint.textContent='Bản ghi không thuộc đoạn chat hiện tại';
    return false;
  }

  sendLocked=true;
  syncSendButtonState();
  const realtimeStore=window.V21MessageStore;
  const replyPayload=replyTarget?{...replyTarget}:null;
  return commitMediaSendTransaction({
    rawText:'',
    text:'',
    attachments:[item],
    replyPayload,
    realtimeStore,
    sendScope
  });
}

function sendNow(){
  clearComposerMediaError();
  const rawText=editor.value.replace(/\r\n/g,'\n');
  const text=rawText.trim();

  if((!text&&pendingAttachments.length===0)||sendLocked||composing)return false;

  const attachments=pendingAttachments.slice();

  sendLocked=true;
  syncSendButtonState();
  const replyPayload=replyTarget?{...replyTarget}:null;
  const realtimeStore=window.V21MessageStore;

  if(attachments.length){
    const sendScope=currentComposerScope();
    const scopeMismatch=sendScope.state!=='READY'||attachments.some(item=>!attachmentBelongsToComposerScope(item,sendScope));
    if(scopeMismatch){
      sendLocked=false;
      composerHint.textContent='Tệp không thuộc đoạn chat hiện tại';
      syncSendButtonState();
      return false;
    }
    void commitMediaSendTransaction({
      rawText,text,attachments:[...attachments],replyPayload,realtimeStore,sendScope
    });
    return true;
  }

  const textSendScope=currentComposerScope();
  const clientId=`client-${Date.now()}-${++seq}`;
  const outgoingText=text;
  const optimistic=createMessage({
    id:clientId,clientId,text:outgoingText,sender:'self',status:'sending',createdAt:Date.now(),replyTo:replyPayload,media:null
  });
  store.appendBatch([optimistic]);
  if(realtimeStore?.isReady?.()){
    realtimeStore.send({
      clientId,text:outgoingText,
      contactId:textSendScope.contactId||null,
      conversationId:textSendScope.conversationId||null,
      reply:replyPayload
    }).then(row=>{
      if(!row)return;
      const currentScope=currentComposerScope();
      const stillVisible=
        currentScope.accountId===textSendScope.accountId&&
        currentScope.contactId===textSendScope.contactId&&
        String(currentScope.conversationId||'')===String(textSendScope.conversationId||'')&&
        currentScope.ownerDraftKey===textSendScope.ownerDraftKey;
      realtimeStore.mergeForContact?.(row,{
        contactId:textSendScope.contactId||null,
        conversationId:textSendScope.conversationId||row?.conversation_id||null
      });
      if(stillVisible){
        window.V21ConversationBridge?.append?.(row,{selfId:realtimeStore.selfAccountId?.(),remote:false});
      }
    }).catch(()=>{
      const createdAt=new Date(optimistic.createdAt).toISOString();
      const failedRow={
        id:clientId,client_id:clientId,
        conversation_id:textSendScope.conversationId||'',
        sender_account_id:textSendScope.accountId||realtimeStore.selfAccountId?.()||'',
        body:outgoingText,created_at:createdAt,updated_at:createdAt,version:0,_local_state:'failed',
        reply_to_message_id:replyPayload?.id||null,reply_preview:replyPayload?.text||null,_reply_sender:replyPayload?.sender||null
      };
      realtimeStore.mergeForContact?.(failedRow,{
        contactId:textSendScope.contactId||null,
        conversationId:textSendScope.conversationId||null
      });
      const currentScope=currentComposerScope();
      const stillVisible=
        currentScope.accountId===textSendScope.accountId&&
        currentScope.contactId===textSendScope.contactId&&
        String(currentScope.conversationId||'')===String(textSendScope.conversationId||'')&&
        currentScope.ownerDraftKey===textSendScope.ownerDraftKey;
      if(stillVisible){
        window.V21ConversationBridge?.append?.(failedRow,{selfId:realtimeStore.selfAccountId?.(),remote:false});
      }
    });
  }else{
    store.appendBatch([createMessage({id:clientId,clientId,text:outgoingText,sender:'self',status:'failed',createdAt:optimistic.createdAt})]);
  }

  commitComposerSnapshotAfterSend({rawText,sentAttachmentIds:[],replyId:replyPayload?.id||null,attachments:[],anchorMessageId:optimistic.id});
  requestAnimationFrame(()=>{
    if(document.activeElement!==editor)editor.focus({preventScroll:true});
    sendLocked=false;syncSendButtonState();
  });
  return true;
}

composerForm.addEventListener(
  'submit',
  e=>{
    e.preventDefault();
    if(!canSendFromComposer()){
      toggleComposerSendMode();
      return;
    }
    sendNow();
  }
);

function isClipboardImageFile(file){
  return !!file&&String(file.type||'').startsWith('image/');
}

function dedupeClipboardFiles(files){
  const seen=new Set();
  return Array.from(files||[]).filter(file=>{
    if(!isClipboardImageFile(file))return false;
    const key=`${file.name||''}:${file.type||''}:${file.size||0}:${file.lastModified||0}`;
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}

function clipboardImageFiles(event){
  const direct=Array.from(event.clipboardData?.files||[]);
  const itemFiles=Array.from(event.clipboardData?.items||[])
    .filter(item=>item.kind==='file'&&String(item.type||'').startsWith('image/'))
    .map(item=>item.getAsFile?.())
    .filter(Boolean);
  return dedupeClipboardFiles([...direct,...itemFiles]);
}

function clipboardHtmlHasImage(html){
  return /<img\b/i.test(String(html||''));
}

function clipboardHtmlImageFallbackCandidates(html){
  if(!clipboardHtmlHasImage(html))return[];
  try{
    const doc=new DOMParser().parseFromString(String(html||''),'text/html');
    const values=[];
    for(const img of doc.querySelectorAll('img')){
      for(const attr of ['src','alt','title']){
        const value=String(img.getAttribute(attr)||'').trim();
        if(value)values.push(value);
      }
      const link=img.closest?.('a[href]');
      const href=String(link?.getAttribute?.('href')||'').trim();
      if(href)values.push(href);
    }
    return values;
  }catch{return[];}
}

function clipboardCompanionText(text,html){
  const raw=String(text||'');
  const trimmed=raw.trim();
  if(!trimmed)return'';
  // Browsers such as Chrome may expose an image URL/alt text as text/plain
  // when the user copied only an image. Do not turn that transport fallback
  // into a visible caption. Real image+text selections remain mixed paste.
  const fallbacks=clipboardHtmlImageFallbackCandidates(html);
  if(fallbacks.some(value=>String(value).trim()===trimmed))return'';
  return raw;
}

function clipboardFileName(type,index=0){
  const ext=type==='image/png'?'png':type==='image/webp'?'webp':type==='image/gif'?'gif':'jpg';
  return `clipboard-${Date.now()}-${index+1}.${ext}`;
}

async function clipboardHtmlImageFiles(html){
  if(!clipboardHtmlHasImage(html))return[];
  const doc=new DOMParser().parseFromString(String(html||''),'text/html');
  const srcs=Array.from(doc.querySelectorAll('img[src]')).map(img=>String(img.getAttribute('src')||'')).filter(Boolean);
  const files=[];
  for(const [index,src] of srcs.entries()){
    if(!/^(data:image\/|blob:|https?:\/\/)/i.test(src))continue;
    try{
      const response=await fetch(src,{credentials:'omit',cache:'no-store'});
      if(!response.ok)continue;
      const blob=await response.blob();
      if(!String(blob.type||'').startsWith('image/'))continue;
      files.push(new File([blob],clipboardFileName(blob.type,index),{type:blob.type,lastModified:Date.now()}));
    }catch{}
  }
  return dedupeClipboardFiles(files);
}

async function clipboardApiImageFiles(){
  if(!navigator.clipboard?.read)return[];
  try{
    const clipboardItems=await navigator.clipboard.read();
    const files=[];
    let index=0;
    for(const item of clipboardItems){
      for(const type of (item.types||[])){
        if(!String(type).startsWith('image/'))continue;
        const blob=await item.getType(type);
        files.push(new File([blob],clipboardFileName(type,index++),{type,lastModified:Date.now()}));
      }
    }
    return dedupeClipboardFiles(files);
  }catch{return[];}
}

async function handleImagePaste(files,html,scope){
  let imageFiles=dedupeClipboardFiles(files);
  if(!imageFiles.length)imageFiles=await clipboardApiImageFiles();
  if(!imageFiles.length&&clipboardHtmlHasImage(html))imageFiles=await clipboardHtmlImageFiles(html);
  if(!imageFiles.length){
    if(ComposerDraftOwner.currentKey()===scope?.ownerDraftKey){
      composerHint.textContent='Không thể đọc ảnh từ clipboard';
    }
    return false;
  }
  const result=await ingestImageFiles(imageFiles,{scope});
  return Number(result?.added)>0;
}

function insertClipboardTextAtCaret(text){
  const value=String(text||'');
  if(!value)return false;
  const start=Number.isFinite(editor.selectionStart)?editor.selectionStart:editor.value.length;
  const end=Number.isFinite(editor.selectionEnd)?editor.selectionEnd:start;
  editor.setRangeText(value,start,end,'end');
  autoGrow({source:'typing'});
  ComposerDraftOwner.saveCurrent();
  syncSendButtonState();
  return true;
}

function classifyPasteTransaction(event){
  // Snapshot every browser-owned clipboard field synchronously. Async image
  // decode/fetch must never read from the event object after the paste turn.
  const data=event.clipboardData||null;
  const files=clipboardImageFiles(event);
  const html=data?.getData?.('text/html')||'';
  const rawText=data?.getData?.('text/plain')||'';
  const hasDirectImage=files.length>0||Array.from(data?.items||[]).some(item=>
    item?.kind==='file'&&String(item.type||'').startsWith('image/')
  );
  const hasHtmlImage=clipboardHtmlHasImage(html);
  const hasImage=hasDirectImage||hasHtmlImage;
  const text=hasImage?clipboardCompanionText(rawText,html):rawText;
  if(!hasImage)return{kind:'text',files:[],html,text};
  return{kind:text?'mixed':'image',files,html,text};
}

editor.addEventListener('paste',event=>{
  const transaction=classifyPasteTransaction(event);
  if(transaction.kind==='text')return;

  // paste is the single owner of one clipboard transaction. beforeinput does
  // not share suppression state, and the async path receives only the snapshot.
  event.preventDefault();
  const pasteScope=currentComposerScope();
  if(transaction.kind==='mixed')insertClipboardTextAtCaret(transaction.text);

  void handleImagePaste(transaction.files,transaction.html,pasteScope).then(()=>{
    if(currentComposerScope().ownerDraftKey!==pasteScope.ownerDraftKey)return;
    if(document.activeElement!==editor)editor.focus({preventScroll:true});
    syncSendButtonState();
  }).catch(error=>{
    console.error('[V21 clipboard image]',error);
    if(currentComposerScope().ownerDraftKey===pasteScope.ownerDraftKey){
      composerHint.textContent=runtimeErrorMessage(error)||'Không thể đọc ảnh từ clipboard';
    }
  });
});

let recentAppleEnterKeydown=null;

editor.addEventListener('beforeinput',event=>{
  if(!appleTouchPlatform || composing || event.isComposing)return;
  if(!['insertLineBreak','insertParagraph'].includes(String(event.inputType||'')))return;

  const now=performance.now();
  const recent=recentAppleEnterKeydown && now-recentAppleEnterKeydown.at<180
    ?recentAppleEnterKeydown
    :null;
  recentAppleEnterKeydown=null;

  // If keydown already consumed this Return, Safari may still surface a
  // beforeinput turn. Cancel it so a ghost newline cannot appear after send.
  if(recent?.consumed){
    event.preventDefault();
    return;
  }

  const action=composerEnterAction({
    mode:composerSendMode,
    shiftKey:Boolean(recent?.shiftKey),
    value:editor.value,
    selectionStart:editor.selectionStart,
    selectionEnd:editor.selectionEnd
  });
  if(action!=='send')return;

  event.preventDefault();
  sendNow();
});

editor.addEventListener(
  'keydown',
  e=>{
    if(composing || e.isComposing)return;
    if(e.key!=='Enter')return;

    if(appleTouchPlatform){
      recentAppleEnterKeydown={
        at:performance.now(),
        shiftKey:Boolean(e.shiftKey),
        consumed:false
      };
    }

    const action=composerEnterAction({
      mode:composerSendMode,
      shiftKey:e.shiftKey,
      value:editor.value,
      selectionStart:editor.selectionStart,
      selectionEnd:editor.selectionEnd
    });
    if(action!=='send')return;

    e.preventDefault();
    if(recentAppleEnterKeydown)recentAppleEnterKeydown.consumed=true;
    sendNow();
  }
);

syncSendButtonState();

/*
  Preserve editor focus when tapping composer action buttons.
  Pointer down is prevented before Safari can blur the editor.
*/
for(const button of document.querySelectorAll('[data-action]')){
  button.addEventListener(
    'pointerdown',
    e=>{
      if(document.activeElement===editor){
        e.preventDefault();
      }
    }
  );
}

/* =========================================================
   FOCUS / KEYBOARD
   Keyboard closed -> sticky owner.
   Keyboard open -> VisualViewport owner.
   Message/Composer internals are not rewritten.
   ========================================================= */
editor.addEventListener('focus',()=>{
  // Focus belongs to Composer/keyboard geometry only. It must never change
  // conversation follow state or request a ScrollRoot transaction.
  modeLabel.textContent=viewport.mode;
  KeyboardInsetAdapter.update();
});

editor.addEventListener('blur',()=>{
  modeLabel.textContent=viewport.mode;
  KeyboardInsetAdapter.update();
});

/* =========================================================
   MANUAL PULL-TO-REFRESH
   Gesture owner only; SyncEngine remains the data owner.
   No location reload and no full snapshot replacement.
   ========================================================= */
function installConversationPullToRefresh(){
  let tracking=false;
  let armed=false;
  let startX=0;
  let startY=0;

  scrollRoot.addEventListener('touchstart',event=>{
    if(event.touches.length!==1||scrollRoot.scrollTop>1){tracking=false;armed=false;return;}
    const touch=event.touches[0];
    startX=touch.clientX;startY=touch.clientY;tracking=true;armed=false;
  },{passive:true});

  scrollRoot.addEventListener('touchmove',event=>{
    if(!tracking||event.touches.length!==1)return;
    const touch=event.touches[0];
    const dx=touch.clientX-startX;
    const dy=touch.clientY-startY;
    armed=dy>=72&&Math.abs(dx)<dy*.65&&scrollRoot.scrollTop<=1;
    scrollRoot.dataset.pullRefresh=armed?'armed':'tracking';
  },{passive:true});

  scrollRoot.addEventListener('touchend',()=>{
    const shouldRefresh=tracking&&armed&&scrollRoot.scrollTop<=1;
    tracking=false;armed=false;
    delete scrollRoot.dataset.pullRefresh;
    if(shouldRefresh)void window.V21SyncEngine?.wake?.({reason:'manual-refresh'});
  },{passive:true});

  scrollRoot.addEventListener('touchcancel',()=>{tracking=false;armed=false;delete scrollRoot.dataset.pullRefresh;},{passive:true});
}

/* =========================================================
   BOOT
   ========================================================= */
function boot(){
  installConversationPullToRefresh();
  const latest=historyItems.slice(TOTAL-50);
  store.appendBatch(latest);

  renderWindow({preserve:'AUTO'});

  autoGrow();
  syncSendButtonState();
  publishComposerHeight();

  requestAnimationFrame(()=>{
    scrollToTail('boot');

    if(
      store.size>0 &&
      messageWindow.children.length===0
    ){
      AppBootController.fail(
        new Error(
          'BOOT invariant: store has messages but DOM window is empty'
        )
      );
      return;
    }

    updateScrollFromEndControl();
    AppBootController.ready();
  });
}

boot();

function mapServerMedia(row){
  const assets=(Array.isArray(row?._media_assets)?row._media_assets:[])
    .filter(item=>item&&!item.deleted_at)
    .sort((a,b)=>Number(a.sort_index||0)-Number(b.sort_index||0)||String(a.id||'').localeCompare(String(b.id||'')));
  if(!assets.length)return null;
  const audio=assets.find(asset=>asset.kind==='audio');
  const imageAssets=assets.filter(item=>item&&item.kind==='image'&&!item.deleted_at);
  if(audio){
    return{
      type:'file',kind:'audio',assetId:String(audio.id),accountId:currentMediaAccountId(),
      name:'recording',displayName:'Ghi âm',durationSeconds:Number(audio.duration_ms)>0?Number(audio.duration_ms)/1000:null,
      durationMs:Number(audio.duration_ms)||null,mimeType:audio.mime_type||'audio/webm',sizeBytes:Number(audio.size_bytes)||0,
      status:row._local_state||'sent'
    };
  }
  const file=assets.find(asset=>asset.kind==='file');
  if(file){
    const name=String(file.file_name||'Tệp');
    return{
      type:'file',kind:'file',assetId:String(file.id),accountId:currentMediaAccountId(),
      name,displayName:name,mimeType:file.mime_type||'application/octet-stream',
      sizeBytes:Number(file.size_bytes)||0,status:row._local_state||'sent'
    };
  }
  const images=imageAssets;
  if(!images.length)return null;
  const items=images.map(asset=>{
    const width=Number(asset.width_px)||null;
    const height=Number(asset.height_px)||null;
    return{
      type:'image',kind:'image',assetId:String(asset.id),accountId:currentMediaAccountId(),width,height,
      aspectRatio:width>0&&height>0?width/height:null,
      mimeType:asset.mime_type||'image/jpeg',sizeBytes:Number(asset.size_bytes)||0,contentHash:asset.content_hash||null,
      status:row._local_state||'sent',sortIndex:Number(asset.sort_index)||0
    };
  });
  return items.length===1?items[0]:{type:'gallery',kind:'image-gallery',items,status:row._local_state||'sent'};
}

function mapV21ServerMessage(row,selfId){
  const media=mapServerMedia(row);
  const text=String(row?.body||'');
  const replyTo=row?.reply_to_message_id?{
    id:String(row.reply_to_message_id),
    text:String(row.reply_preview||'Tin nhắn'),
    sender:row.reply_sender_account_id
      ?(String(row.reply_sender_account_id)===String(selfId)?'self':'remote')
      :(row._reply_sender==='self'?'self':'remote')
  }:null;
  return createMessage({
    id:String(row.id),
    clientId:row.client_id?String(row.client_id):null,
    text,
    kind:deriveMessageKind({text,media}),
    sender:String(row.sender_account_id)===String(selfId)?'self':'remote',
    status:row._local_state==='pending'?'sending':(row._local_state==='failed'?'failed':'sent'),
    createdAt:Date.parse(row.created_at)||Date.now(),
    cached:Boolean(row._cached),
    replyTo,
    media
  });
}

window.V21ConversationBridge={
  clear(){
    beginConversationViewContext();
    store.clear();
    heightCache.clear();
    olderCursor=0;
    viewport.returnToTail();
    renderWindow({preserve:'AUTO'});
    scrollToTail('bridge-clear');
  },
  captureViewState(){
    const viewportState=viewport.captureState();
    return{
      ...viewportState,
      distanceFromTail:distanceFromTail(),
      anchor:firstVisibleAnchor()
    };
  },
  replace(rows,{selfId,viewState=null}={}){
    const viewEpoch=beginConversationViewContext();
    store.clear();
    heightCache.clear();
    olderCursor=0;
    const mapped=(Array.isArray(rows)?rows:[]).map(row=>mapV21ServerMessage(row,selfId));
    store.appendBatch(mapped);
    const restoreHistory=Boolean(viewState&&viewState.mode===VIEWPORT_STATES.USER_AWAY&&mapped.length);
    if(restoreHistory){
      viewport.restoreState(viewState);
      const anchor=viewState.anchor||null;
      const anchorIndex=anchor?findAnchorIndex(anchor):null;
      renderWindow({preserve:'AUTO',anchorIndexOverride:anchorIndex});
      requestAnimationFrame(()=>{
        if(viewEpoch!==conversationViewEpoch)return;
        if(anchor)restoreAnchor(anchor);
        else if(Number.isFinite(Number(viewState.distanceFromTail))){
          setScrollTop(scrollRoot.scrollHeight-scrollRoot.clientHeight-Math.max(0,Number(viewState.distanceFromTail)||0));
        }
        updateScrollFromEndControl();
      });
    }else{
      viewport.returnToTail();
      renderWindow({preserve:'AUTO'});
      scrollToTail('bridge-replace');
    }
    return store.size;
  },
  reconcile(rows,{selfId}={}){
    const mapped=(Array.isArray(rows)?rows:[]).filter(row=>row?.id).map(row=>mapV21ServerMessage(row,selfId));
    if(!mapped.length)return{size:store.size,inserted:0};
    const beforeKeys=new Set(store.items.map(message=>stableMessageDomKey(message)));
    store.appendBatch(mapped);
    const insertedMessages=store.items.filter(message=>!beforeKeys.has(stableMessageDomKey(message)));
    const remoteIds=insertedMessages.filter(message=>message.sender!=='self').map(message=>message.id);
    const policy=appendScrollPolicy({
      inserted:insertedMessages.length>0,
      remote:remoteIds.length>0,
      messageIds:remoteIds
    });
    renderWindow({preserve:policy.preserve});
    if(policy.followTail)scrollToTail('reconcile-new-message');
    else updateScrollFromEndControl();
    return{size:store.size,inserted:insertedMessages.length};
  },
  append(row,{selfId,remote}={}){
    if(!row?.id)return false;
    const rowId=String(row.id);
    const clientId=row.client_id?String(row.client_id):null;
    if(store.byId.has(rowId)&&!clientId)return false;
    const msg=mapV21ServerMessage(row,selfId);
    const before=store.size;
    store.appendBatch([msg]);
    const inserted=store.size>before;
    // Only a NEW logical message may request follow-tail. ACK/status/media-child
    // merges are data updates and must never create a second scroll command.
    const policy=appendScrollPolicy({
      inserted,remote:Boolean(remote),messageIds:[msg.id]
    });
    renderWindow({preserve:policy.preserve});
    if(policy.followTail)scrollToTail(remote?'remote-message':'new-message');
    else updateScrollFromEndControl();
    return true;
  },
  remove(id){
    const key=String(id||'');
    if(!key||!store.removeById?.(key))return false;
    heightCache.delete(key);
    renderWindow({preserve:'VIEW'});
    updateScrollFromEndControl();
    return true;
  },
  snapshot(){return{size:store.size,viewportMode:viewport.mode};}
};

window.ChatScreenModule={
  version:'V21.72.19',
  snapshot(){
    return{
      viewportMode:viewport.mode,
      distanceFromTail:distanceFromTail(),
      storeSize:store.size,
      renderedRange:{...renderedRange},
      stickyPaddingBottom:getComputedStyle(scrollRoot)
        .getPropertyValue('--sticky-padding-bottom')
        .trim(),
      keyboardHeight:getComputedStyle(scrollRoot)
        .getPropertyValue('--screen-keyboard-height')
        .trim(),
      composerPlacement:scrollRoot.dataset.composerPlacement||'sticky',
      composerDraftKey:ComposerDraftOwner.currentKey(),
      composerDraftCount:ComposerDraftOwner.drafts.size,
      editorFocused:document.activeElement===editor,
      remoteTyping,
      scrollFromEnd:scrollRoot.hasAttribute('data-scroll-from-end')
    };
  }
};
})();

