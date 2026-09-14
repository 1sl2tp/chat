(()=>{
'use strict';

const RESULT_MODE='AI_EXTRACT_MODAL';
const RESULT_OWNER='admin-ai-extract';
let selectionButton=null;
let selectionText='';
let resultOverlay=null;
let resultReturnFocus=null;
let currentResult=null;
let selectionFrame=0;
let viewerObserver=null;

function authStore(){return window.V21AuthSessionStore||null;}
function currentAdmin(){
  const snapshot=authStore()?.snapshot?.()||{};
  return snapshot.state==='AUTHENTICATED'&&snapshot.account?.role==='admin'
    ?snapshot.account
    :null;
}
function activeContactId(){
  const message=window.V21MessageStore?.snapshot?.()||{};
  const fromMessage=String(message.currentContactId||'').trim();
  if(fromMessage)return fromMessage;
  const shell=window.ChatAppShell?.ScreenSession?.snapshot?.()||{};
  return String(shell.activeContact?.id||'').trim();
}
function interactionController(){return window.V21InteractionController||null;}
function overlayRoot(){return document.getElementById('globalOverlayRoot')||document.body;}
function orderScribe(){return window.V21OrderScribeClient||null;}

function installStyle(){
  if(document.getElementById('v21-ai-extract-style'))return;
  const style=document.createElement('style');
  style.id='v21-ai-extract-style';
  style.textContent=`
    .ai-selection-action{position:fixed;z-index:165;min-width:40px;height:32px;padding:0 10px;border:1px solid var(--theme-border-default,#dedede);border-radius:16px;background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff);box-shadow:0 6px 22px rgba(0,0,0,.16);font:700 13px/1 system-ui;cursor:pointer}
    .ai-selection-action[hidden]{display:none!important}
    .image-review-ai{min-width:42px;padding:0 10px;font:700 13px/1 system-ui}
    .ai-extract-overlay{position:fixed;inset:0;z-index:185;display:grid;place-items:center;padding:14px;pointer-events:auto}
    .ai-extract-backdrop{position:absolute;inset:0;border:0;background:rgba(0,0,0,.24)}
    .ai-extract-card{position:relative;z-index:1;width:min(92vw,480px);max-height:min(86vh,720px);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:10px;padding:14px;border:1px solid var(--theme-border-default,#dedede);border-radius:18px;background:var(--theme-surface-primary,#fff);box-shadow:0 18px 50px rgba(0,0,0,.18)}
    .ai-extract-head{display:flex;align-items:center;gap:10px}
    .ai-extract-title{margin:0;flex:1;font-size:17px;font-weight:750}
    .ai-extract-close{width:34px;height:34px;border:0;border-radius:50%;background:var(--theme-surface-secondary,#f4f4f4);color:var(--theme-content-primary,#171717);font:700 19px/1 system-ui;cursor:pointer}
    .ai-extract-status{min-height:18px;margin:0;color:var(--theme-content-secondary,#666);font-size:12px;line-height:18px}
    .ai-extract-status[data-error="true"]{color:#b42318}
    .ai-extract-text{box-sizing:border-box;min-height:120px;max-height:52vh;margin:0;padding:12px;border:1px solid var(--theme-border-default,#dedede);border-radius:12px;background:var(--theme-surface-secondary,#f7f7f7);color:var(--theme-content-primary,#171717);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:500 14px/1.55 system-ui;user-select:text;-webkit-user-select:text}
    .ai-extract-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .ai-extract-action{min-height:40px;border:1px solid var(--theme-border-default,#dedede);border-radius:11px;background:var(--theme-surface-secondary,#f5f5f5);color:var(--theme-content-primary,#171717);font:650 13px/1 system-ui;cursor:pointer}
    .ai-extract-action:disabled{opacity:.45;cursor:default}
    @media(max-width:520px){.ai-extract-overlay{padding:8px}.ai-extract-card{width:min(96vw,480px);padding:11px;border-radius:15px}}
  `;
  document.head.appendChild(style);
}

function hideSelectionButton(){
  if(selectionButton)selectionButton.hidden=true;
}
function ensureSelectionButton(){
  installStyle();
  if(selectionButton)return selectionButton;
  const button=document.createElement('button');
  button.type='button';
  button.className='ai-selection-action';
  button.dataset.aiSelectionAction='';
  button.textContent='AI';
  button.hidden=true;
  button.addEventListener('pointerdown',event=>event.preventDefault());
  button.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    const text=selectionText;
    hideSelectionButton();
    if(text)void runAI({text});
  });
  document.body.appendChild(button);
  selectionButton=button;
  return button;
}
function nodeElement(node){
  if(node instanceof Element)return node;
  return node?.parentElement instanceof Element?node.parentElement:null;
}
function selectionInsideChat(selection){
  if(!selection||selection.rangeCount<1)return false;
  const anchor=nodeElement(selection.anchorNode);
  const focus=nodeElement(selection.focusNode);
  const selector='#messageWindow,#scrollRoot,[data-chat-thread-node]';
  return Boolean(anchor?.closest(selector)&&focus?.closest(selector));
}
function syncSelectionAction(){
  selectionFrame=0;
  const button=ensureSelectionButton();
  if(!currentAdmin()||!activeContactId()){
    selectionText='';
    button.hidden=true;
    return;
  }
  const selection=window.getSelection?.();
  const text=String(selection?.toString?.()||'').replace(/\r\n?/g,'\n').trim();
  if(!text||!selectionInsideChat(selection)){
    selectionText='';
    button.hidden=true;
    return;
  }
  let rect=null;
  try{rect=selection.getRangeAt(0).getBoundingClientRect();}catch{}
  if(!rect||(!rect.width&&!rect.height)){
    button.hidden=true;
    return;
  }
  selectionText=text;
  const width=44;
  const left=Math.max(8,Math.min(window.innerWidth-width-8,rect.left+rect.width/2-width/2));
  const top=Math.max(8,rect.top-38);
  button.style.left=`${Math.round(left)}px`;
  button.style.top=`${Math.round(top)}px`;
  button.hidden=false;
}
function scheduleSelectionAction(){
  if(selectionFrame)return;
  selectionFrame=requestAnimationFrame(syncSelectionAction);
}

function resultErrorText(error){
  const code=String(error?.message||error||'ai_unavailable').replace(/^FunctionsHttpError:\s*/,'').trim();
  const known={
    authentication_required:'Cần đăng nhập Admin.',
    admin_required:'Chỉ Admin được dùng AI.',
    contact_required:'Chọn khách trước.',
    source_image_not_found:'Ảnh này không phải ảnh khách gửi hoặc không còn khả dụng.',
    image_unavailable:'Không tải được ảnh.',
    ai_not_configured:'AI chưa được cấu hình.',
    ai_unavailable:'AI đang không khả dụng, thử lại sau.',
    ai_response_invalid:'AI trả kết quả không hợp lệ.',
    ai_items_missing:'AI chưa tách được nội dung.',
    order_text_required:'Chưa có nội dung để AI đọc.',
  };
  return known[code]||code;
}
function lockResult(){
  const controller=interactionController();
  if(!controller)return true;
  const lease=controller.enter?.(RESULT_MODE,{owner:RESULT_OWNER,lockBaseUi:true});
  return Boolean(lease);
}
function unlockResult(){
  interactionController()?.exit?.(RESULT_MODE,{owner:RESULT_OWNER});
}
function closeResult({restoreFocus=true}={}){
  if(resultOverlay){resultOverlay.remove();resultOverlay=null;}
  currentResult=null;
  unlockResult();
  const node=resultReturnFocus;
  resultReturnFocus=null;
  if(restoreFocus&&node?.isConnected){
    window.setTimeout(()=>{try{node.focus({preventScroll:true});}catch{}},0);
  }
}
function buildResultOverlay(){
  installStyle();
  if(resultOverlay)return resultOverlay;
  if(!lockResult())throw new Error('ai_result_busy');
  resultReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const section=document.createElement('section');
  section.className='ai-extract-overlay';
  section.dataset.aiResult='';
  section.innerHTML=`
    <button type="button" class="ai-extract-backdrop" data-ai-close aria-label="Đóng"></button>
    <div class="ai-extract-card" role="dialog" aria-modal="true" aria-label="AI tách nội dung">
      <div class="ai-extract-head">
        <h2 class="ai-extract-title">AI tách nội dung</h2>
        <button type="button" class="ai-extract-close" data-ai-close aria-label="Đóng">×</button>
      </div>
      <p class="ai-extract-status" data-ai-status data-error="false">Đang đọc…</p>
      <pre class="ai-extract-text" data-ai-result-text>Đang xử lý…</pre>
      <div class="ai-extract-actions">
        <button type="button" class="ai-extract-action" data-ai-copy disabled>Copy</button>
        <button type="button" class="ai-extract-action" data-ai-close>Đóng</button>
      </div>
    </div>`;
  for(const button of section.querySelectorAll('[data-ai-close]'))button.addEventListener('click',()=>closeResult());
  section.querySelector('[data-ai-copy]')?.addEventListener('click',()=>void copyCurrentResult());
  overlayRoot().appendChild(section);
  resultOverlay=section;
  return section;
}
function setResultState({status='',text='',error=false,busy=false}={}){
  const overlay=buildResultOverlay();
  const statusNode=overlay.querySelector('[data-ai-status]');
  const textNode=overlay.querySelector('[data-ai-result-text]');
  const copyButton=overlay.querySelector('[data-ai-copy]');
  if(statusNode){statusNode.textContent=String(status||'');statusNode.dataset.error=String(Boolean(error));}
  if(textNode)textNode.textContent=String(text||'');
  if(copyButton)copyButton.disabled=busy||!String(text||'').trim();
}
async function copyCurrentResult(){
  const text=String(currentResult?.text||'').trim();
  if(!text)return false;
  try{
    await navigator.clipboard.writeText(text);
    setResultState({status:'Đã sao chép.',text});
    return true;
  }catch(error){
    setResultState({status:'Không sao chép được.',text,error:true});
    return false;
  }
}
async function showError(error){
  try{
    buildResultOverlay();
    setResultState({status:resultErrorText(error),text:'',error:true,busy:false});
  }catch{}
}
async function runAI({text='',imageAssetIds=[]}={}){
  const contactId=activeContactId();
  if(!currentAdmin()||!contactId){await showError(new Error('contact_required'));return null;}
  const client=orderScribe();
  if(!client?.ai){await showError(new Error('ai_unavailable'));return null;}
  try{
    buildResultOverlay();
    setResultState({status:imageAssetIds.length?'AI đang đọc ảnh…':'AI đang tách đoạn đã chọn…',text:'Đang xử lý…',busy:true});
    const data=await client.ai({contactId,text:String(text||''),imageAssetIds});
    const resultText=String(data?.text||'').trim();
    const items=Array.isArray(data?.items)?data.items:[];
    currentResult={...data,text:resultText,items};
    setResultState({
      status:`${items.length} dòng`,
      text:resultText||'Không có kết quả.',
      busy:false,
    });
    return currentResult;
  }catch(error){
    currentResult=null;
    setResultState({status:resultErrorText(error),text:'',error:true,busy:false});
    return null;
  }
}

function currentViewerAssetId(){
  const active=document.querySelector('.image-review-thumb[aria-current="true"] .image-review-thumb-image');
  return String(active?.dataset?.assetId||'').trim();
}
function ensureImageAiAction(){
  if(!currentAdmin())return null;
  const head=document.querySelector('.image-review-head');
  if(!head)return null;
  let button=head.querySelector('[data-image-ai-action]');
  if(button)return button;
  button=document.createElement('button');
  button.type='button';
  button.className='image-review-control image-review-ai';
  button.dataset.imageAiAction='';
  button.textContent='AI';
  button.setAttribute('aria-label','AI đọc ảnh');
  const close=head.querySelector('.image-review-close');
  head.insertBefore(button,close||null);
  button.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    const assetId=currentViewerAssetId();
    if(!assetId)return;
    document.querySelector('.image-review-close')?.click?.();
    window.setTimeout(()=>void runAI({imageAssetIds:[assetId]}),0);
  });
  return button;
}
function observeImageViewer(){
  if(viewerObserver)return;
  viewerObserver=new MutationObserver(()=>ensureImageAiAction());
  viewerObserver.observe(document.documentElement,{subtree:true,childList:true});
  ensureImageAiAction();
}
function init(){
  installStyle();
  ensureSelectionButton();
  document.addEventListener('selectionchange',scheduleSelectionAction);
  document.addEventListener('navigation-change',hideSelectionButton);
  document.addEventListener('v21-auth-state',()=>{hideSelectionButton();ensureImageAiAction();});
  window.addEventListener('scroll',hideSelectionButton,true);
  window.addEventListener('resize',hideSelectionButton,{passive:true});
  observeImageViewer();
}

window.V21AIExtract=Object.freeze({
  runText(text){return runAI({text:String(text||'')});},
  openImage(assetId){return runAI({imageAssetIds:[String(assetId||'')]});},
  close:closeResult,
});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
