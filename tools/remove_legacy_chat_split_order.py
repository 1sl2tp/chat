from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

ADMIN_ACTIONS = r'''(()=>{
'use strict';

const MENU_ID='composerActionMenu';
const SECTION_ATTR='data-admin-composer-section';
const ACTION_ATTR='data-admin-composer-action';
const QUOTE_MODAL_MODE='QUOTE_MODAL';
const QUOTE_MODAL_OWNER='admin-quote-modal';
let quoteModulePromise=null;
let quoteOverlay=null;
let quoteReturnFocus=null;
let transientHintTimer=0;

function authStore(){return window.V21AuthSessionStore||null;}
function currentAdmin(){
  const snapshot=authStore()?.snapshot?.()||{};
  return snapshot.state==='AUTHENTICATED'&&snapshot.account?.role==='admin'
    ?snapshot.account
    :null;
}
function activeContactId(){
  const messageState=window.V21MessageStore?.snapshot?.()||{};
  const fromMessage=String(messageState.currentContactId||'').trim();
  if(fromMessage)return fromMessage;
  const shellState=window.ChatAppShell?.ScreenSession?.snapshot?.()||{};
  return String(shellState.activeContact?.id||'').trim();
}
function interactionController(){return window.V21InteractionController||null;}
function lockQuoteBackground(){
  const lease=interactionController()?.enter?.(QUOTE_MODAL_MODE,{owner:QUOTE_MODAL_OWNER,lockBaseUi:true});
  if(!lease)return false;
  quoteReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  try{quoteReturnFocus?.blur?.();}catch{}
  return true;
}
function unlockQuoteBackground({restoreFocus=true}={}){
  interactionController()?.exit?.(QUOTE_MODAL_MODE,{owner:QUOTE_MODAL_OWNER});
  const returnNode=quoteReturnFocus;
  quoteReturnFocus=null;
  if(restoreFocus&&returnNode?.isConnected){
    window.setTimeout(()=>{try{returnNode.focus({preventScroll:true});}catch{}},0);
  }
}

function actionMenu(){return document.getElementById(MENU_ID);}
function menuSurface(){return actionMenu()?.querySelector?.('.composer-action-menu-surface')||null;}
function isPopoverOpen(node){
  if(!node)return false;
  try{return node.matches(':popover-open');}catch{return node.dataset.adminOpen==='true';}
}
function hideMenu(){
  const menu=actionMenu();
  if(!menu)return false;
  try{menu.hidePopover?.();}catch{}
  menu.dataset.adminOpen='false';
  return true;
}
function showMenu(){
  const menu=actionMenu();
  if(!menu)return false;
  try{menu.showPopover?.();}catch{}
  menu.dataset.adminOpen='true';
  return true;
}
function setTransientHint(text,duration=1800){
  const hint=document.getElementById('composerHint');
  if(!hint)return;
  if(transientHintTimer)clearTimeout(transientHintTimer);
  const previous=hint.textContent;
  const next=String(text||'');
  hint.textContent=next;
  transientHintTimer=window.setTimeout(()=>{
    transientHintTimer=0;
    if(hint.textContent===next)hint.textContent=previous;
  },Math.max(600,Number(duration)||1800));
}

function installStyle(){
  if(document.getElementById('v21-admin-composer-actions-style'))return;
  const style=document.createElement('style');
  style.id='v21-admin-composer-actions-style';
  style.textContent=`
    html[data-admin-composer-actions="true"] [data-quote-admin-block],
    html[data-admin-composer-actions="true"] [data-call-invite-admin-block]{display:none!important}
    .admin-composer-menu-label{padding:7px 12px 4px;color:var(--theme-content-tertiary,#888);font-size:11px;font-weight:700;line-height:14px;text-transform:uppercase;letter-spacing:.04em}
    .admin-composer-menu-item[disabled]{opacity:.48;cursor:default}
    .admin-composer-quote-overlay{position:fixed;inset:0;z-index:170;display:grid;place-items:center;padding:18px;pointer-events:auto}
    .admin-composer-quote-backdrop{position:absolute;inset:0;border:0;background:rgba(0,0,0,.28);backdrop-filter:blur(2px)}
    .admin-composer-quote-card{position:relative;z-index:1;width:min(92vw,390px);display:grid;gap:12px;padding:16px;border:1px solid var(--theme-border-default,#dedede);border-radius:20px;background:var(--theme-surface-primary,#fff);box-shadow:0 18px 50px rgba(0,0,0,.18)}
    .admin-composer-quote-title{margin:0;font-size:17px;font-weight:700}
    .admin-composer-quote-scopes{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .admin-composer-quote-scopes button,.admin-composer-quote-send,.admin-composer-quote-cancel{min-height:42px;border:1px solid var(--theme-border-default,#dedede);border-radius:13px;background:var(--theme-surface-secondary,#f5f5f5);color:var(--theme-content-primary,#171717);font:inherit;font-weight:650;cursor:pointer}
    .admin-composer-quote-scopes button[data-active="true"]{background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff);border-color:var(--theme-content-primary,#171717)}
    .admin-composer-quote-source{width:100%;min-height:42px;border:1px solid var(--theme-border-default,#dedede);border-radius:13px;padding:0 10px;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717);font:inherit}
    .admin-composer-quote-source[hidden]{display:none}
    .admin-composer-quote-status{min-height:18px;margin:0;color:var(--theme-content-secondary,#666);font-size:12px;line-height:18px}
    .admin-composer-quote-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:8px}
    .admin-composer-quote-send{background:var(--theme-content-primary,#171717);color:var(--theme-surface-primary,#fff);border-color:var(--theme-content-primary,#171717)}
    .admin-composer-quote-send:disabled,.admin-composer-quote-cancel:disabled{opacity:.5;cursor:default}
  `;
  document.head.appendChild(style);
}

function iconSvg(kind){
  const icons={
    quote:'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 4h14v16H5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    call:'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M7.2 4.5 10 8l-1.8 2.2c1.2 2.5 3.1 4.4 5.6 5.6L16 14l3.5 2.8-.9 2.7c-.3.8-1.1 1.3-2 1.2C9.4 19.8 4.2 14.6 3.3 7.4c-.1-.9.4-1.7 1.2-2l2.7-.9Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  };
  return icons[kind]||icons.quote;
}
function actionButton({action='',label='',kind='quote'}={}){
  const button=document.createElement('button');
  button.type='button';
  button.className='composer-action-menu-item admin-composer-menu-item';
  button.setAttribute('role','menuitem');
  button.setAttribute(ACTION_ATTR,action);
  button.innerHTML=`<span class="composer-action-menu-icon" aria-hidden="true">${iconSvg(kind)}</span><span class="composer-action-menu-label">${label}</span>`;
  return button;
}
function makeLabel(text){
  const node=document.createElement('div');
  node.className='admin-composer-menu-label';
  node.textContent=text;
  return node;
}
function ensureAdminMenu(){
  installStyle();
  const surface=menuSurface();
  if(!surface)return null;
  let section=surface.querySelector(`[${SECTION_ATTR}]`);
  if(!section){
    const sendLabel=makeLabel('Gửi');
    sendLabel.dataset.adminComposerSendLabel='';
    surface.insertBefore(sendLabel,surface.firstChild);
    section=document.createElement('div');
    section.setAttribute(SECTION_ATTR,'');
    section.append(
      actionButton({action:'quote',label:'Báo giá',kind:'quote'}),
      actionButton({action:'call-link',label:'Link gọi',kind:'call'}),
    );
    surface.appendChild(section);
  }
  syncVisibility();
  return section;
}
function syncVisibility(){
  const admin=Boolean(currentAdmin());
  const contact=Boolean(activeContactId());
  document.documentElement.dataset.adminComposerActions=String(admin);
  const surface=menuSurface();
  if(!surface)return admin;
  const label=surface.querySelector('[data-admin-composer-send-label]');
  const section=surface.querySelector(`[${SECTION_ATTR}]`);
  if(label)label.hidden=!admin;
  if(section)section.hidden=!admin;
  if(section){
    for(const button of section.querySelectorAll(`[${ACTION_ATTR}]`))button.disabled=!admin||!contact;
  }
  return admin;
}

async function quoteClient(){
  if(window.V21QuoteClient)return window.V21QuoteClient;
  if(!quoteModulePromise)quoteModulePromise=import('./quote-client.js').then(()=>window.V21QuoteClient||null);
  return quoteModulePromise;
}
async function sendQuoteTextLink(url,contactId){
  const text=String(url||'').trim();
  const target=String(contactId||'').trim();
  if(!text||!target)throw new Error('conversation_not_ready');
  const messageStore=window.V21MessageStore||null;
  const sync=window.V21SyncEngine||null;
  const messageState=messageStore?.snapshot?.()||{};
  const clientId=window.V21RuntimeId?.create?.()||`quote-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  if(messageStore?.send&&messageState.ready&&String(messageState.currentContactId||'')===target){
    await messageStore.send({clientId,text,contactId:target,conversationId:messageState.currentConversationId||null,reply:null});
  }else{
    if(!sync?.queueText)throw new Error('conversation_not_ready');
    await sync.queueText({clientId,text,contactId:target,conversationId:null,reply:null});
  }
  void sync?.wake?.({reason:'quote-link-send'});
  return true;
}
function closeQuote({restoreFocus=true}={}){
  const hadOverlay=Boolean(quoteOverlay);
  if(quoteOverlay){quoteOverlay.remove();quoteOverlay=null;}
  unlockQuoteBackground({restoreFocus});
  return hadOverlay;
}
async function openQuote(contactId){
  const client=await quoteClient();
  if(!client?.create)throw new Error('quote_client_unavailable');
  const root=document.getElementById('globalOverlayRoot');
  if(!root)throw new Error('quote_overlay_unavailable');
  closeQuote({restoreFocus:false});
  if(!lockQuoteBackground())throw new Error('quote_modal_busy');
  const sources=Array.isArray(client.sources)?client.sources:[];
  const overlay=document.createElement('section');
  overlay.className='admin-composer-quote-overlay';
  overlay.dataset.adminComposerQuote='';
  overlay.innerHTML=`
    <button type="button" class="admin-composer-quote-backdrop" data-quote-close aria-label="Đóng"></button>
    <div class="admin-composer-quote-card" role="dialog" aria-modal="true" aria-label="Báo giá">
      <h2 class="admin-composer-quote-title">Báo giá</h2>
      <div class="admin-composer-quote-scopes" role="group" aria-label="Phạm vi báo giá">
        <button type="button" data-quote-scope="all" data-active="true">Tất cả</button>
        <button type="button" data-quote-scope="source" data-active="false">Theo nguồn</button>
      </div>
      <select class="admin-composer-quote-source" data-quote-source hidden aria-label="Nguồn báo giá">${sources.map(([key,label])=>`<option value="${String(key)}">${String(label)}</option>`).join('')}</select>
      <p class="admin-composer-quote-status" data-quote-status></p>
      <div class="admin-composer-quote-actions">
        <button type="button" class="admin-composer-quote-cancel" data-quote-close>Hủy</button>
        <button type="button" class="admin-composer-quote-send" data-quote-send>Gửi báo giá</button>
      </div>
    </div>`;
  root.appendChild(overlay);
  quoteOverlay=overlay;
  let scope='all';
  const source=overlay.querySelector('[data-quote-source]');
  const status=overlay.querySelector('[data-quote-status]');
  const send=overlay.querySelector('[data-quote-send]');
  const scopeButtons=[...overlay.querySelectorAll('[data-quote-scope]')];
  function setBusy(busy){
    send.disabled=Boolean(busy);
    for(const button of overlay.querySelectorAll('[data-quote-close]'))button.disabled=Boolean(busy);
  }
  for(const button of overlay.querySelectorAll('[data-quote-close]'))button.addEventListener('click',closeQuote);
  for(const button of scopeButtons)button.addEventListener('click',()=>{
    scope=button.dataset.quoteScope==='source'?'source':'all';
    for(const item of scopeButtons)item.dataset.active=String(item.dataset.quoteScope===scope);
    source.hidden=scope!=='source';
    status.textContent='';
  });
  send.addEventListener('click',async()=>{
    setBusy(true);status.textContent='Đang tạo và gửi…';
    try{
      const quote=await client.create({scope,sourceKey:scope==='source'?source.value:''});
      await sendQuoteTextLink(quote.url,contactId);
      closeQuote();
      setTransientHint('Đã gửi link báo giá');
    }catch(error){status.textContent=String(error?.message||error||'Không thể gửi báo giá');setBusy(false);}
  });
  return true;
}

async function runAction(action){
  if(!currentAdmin())return false;
  const contactId=activeContactId();
  if(!contactId)return false;
  hideMenu();
  if(action==='quote'){
    try{return await openQuote(contactId);}catch{setTransientHint('Không thể mở báo giá');return false;}
  }
  if(action==='call-link'){
    const client=window.TaphoaCallInviteClient||null;
    if(!client?.createAndSend){setTransientHint('Link gọi chưa sẵn sàng');return false;}
    setTransientHint('Đang gửi link gọi…',2400);
    try{await client.createAndSend({contactId});setTransientHint('Đã gửi link gọi');return true;}
    catch{setTransientHint('Không thể gửi link gọi',2600);return false;}
  }
  return false;
}

function bind(){
  const plus=document.getElementById('composer-plus-btn');
  if(!plus)return false;
  ensureAdminMenu();
  plus.addEventListener('click',event=>{
    if(!currentAdmin())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    ensureAdminMenu();
    const menu=actionMenu();
    if(!menu)return;
    isPopoverOpen(menu)?hideMenu():showMenu();
  },true);
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    const button=target?.closest?.(`[${ACTION_ATTR}]`);
    if(!button||button.disabled)return;
    event.preventDefault();
    event.stopPropagation();
    void runAction(String(button.getAttribute(ACTION_ATTR)||''));
  },true);
  document.addEventListener('v21-auth-state',()=>{ensureAdminMenu();syncVisibility();});
  document.addEventListener('v21-message-store-state',syncVisibility);
  document.addEventListener('navigation-change',syncVisibility);
  return true;
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
else bind();

window.V21AdminComposerActions=Object.freeze({
  mount:ensureAdminMenu,
  run:runAction,
  openQuote,
  activeContactId,
});
})();
'''

QUOTE_TEST = r'''from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / "quote-client.js"
ACTIONS = ROOT / "admin-composer-actions.js"
CALL_CLIENT = ROOT / "call-invite-client.js"
DIRECTORY = ROOT / "contact-directory-admin.js"

assert CLIENT.exists(), "quotation UI/client module must exist"
assert CALL_CLIENT.exists(), "call invite client module must exist"
assert ACTIONS.exists(), "Admin composer actions module must exist"
assert DIRECTORY.exists(), "contact directory admin module must exist"

quote = CLIENT.read_text(encoding="utf-8")
actions = ACTIONS.read_text(encoding="utf-8")
call = CALL_CLIENT.read_text(encoding="utf-8")
directory = DIRECTORY.read_text(encoding="utf-8")
low = actions.lower()
compact = "".join(low.split())
quote_low = quote.lower()
directory_low = directory.lower()

for needle in [
    "role==='admin'",
    "[data-contact-manage]",
    "[data-profile-overlay]",
    "báo giá",
    "tất cả",
    "theo nguồn",
    "tạo link",
    "sao chép",
    "gửi",
    "hang-thuong",
    "hang-u",
    "masan",
    "sua",
    "thuoc-la",
    "v21-quote",
    "navigator.clipboard",
    "v21syncengine",
    "queuetext",
]:
    assert needle in quote_low, f"missing quotation Chat UI contract: {needle}"

assert "import('./quote-client.js')" in directory or 'import("./quote-client.js")' in directory
for forbidden in ["v21-zalo-", "zalo.me", "openapi.zalo", "zalo api"]:
    assert forbidden not in quote_low
assert "functions.invoke('v21-quote'" in quote_low or 'functions.invoke("v21-quote"' in quote_low
assert "contactid:targetaccountid" in quote_low.replace(" ", "")

for needle in ["role==='admin'", "báo giá", "link gọi", "data-admin-composer-action"]:
    assert needle in low, f"missing Admin composer action contract: {needle}"

for forbidden in [
    "tạo đơn", "đơn tạm", "đã giao", "công nợ", "data-admin-order-action",
    "tách nhanh", "ai ghi đơn", "v21-order-scribe", "data-order-mode",
    "selectedchattext", "capturechatselection", "selectionchange",
]:
    assert forbidden not in low, f"legacy Chat order/split behavior remains: {forbidden}"

assert "v21quoteclient" in low
assert "queuetext" in low or "v21messagestore" in low
assert "contactid" in low
quote_overlay_css = low.split(".admin-composer-quote-overlay", 1)[1].split("}", 1)[0]
assert "pointer-events:auto" in quote_overlay_css
assert "v21interactioncontroller" in low
assert "enter?.(" in compact and "lockbaseui:true" in compact
assert "admin-quote-modal" in low
assert "exit?.(" in compact
assert "taphoacallinviteclient" in low
assert "createandsend" in low and "contactid" in low
assert "v21_call_start" not in low
assert "[data-quote-admin-block]" in actions
assert "[data-call-invite-admin-block]" in actions
assert "display:none!important" in low
assert "node.remove()" not in low
assert "new mutationobserver(schedulelegacysuppression)" not in low
assert "import('./admin-composer-actions.js')" in quote or 'import("./admin-composer-actions.js")' in quote
subprocess.run(["node", "--check", str(ACTIONS)], check=True)
print("chat quote + Admin composer actions contract PASS")
'''

(ROOT / 'admin-composer-actions.js').write_text(ADMIN_ACTIONS, encoding='utf-8')
(ROOT / 'tests/test_v21_quote_chat_ui.py').write_text(QUOTE_TEST, encoding='utf-8')

source_path = ROOT / 'index.source.html'
source = source_path.read_text(encoding='utf-8')
needle = '<script src="./order-scribe-client.js" data-build-source="order-scribe-client.js"></script>\n'
if needle not in source:
    raise SystemExit('order-scribe-client script tag not found')
source_path.write_text(source.replace(needle, '', 1), encoding='utf-8')

workflow_path = ROOT / '.github/workflows/verify-v21.yml'
workflow_lines = workflow_path.read_text(encoding='utf-8').splitlines(keepends=True)
remove_steps = {
    'Chat AI product parser core contract',
    'Chat shared-product catalog search contract',
    'Chat order summary footer contract',
    'Chat exact key common-left-prefix contract',
    'Chat AI product parser edge isolation contract',
    'Chat AI database isolation contract',
    'Manual order scribe raw-name core contract',
    'Master full SL + name contract',
    'Handwritten repeat-marker inheritance contract',
    'Manual order scribe client normalization',
    'Manual order scribe Edge contract',
    'Grocery reference ranking contract',
    'Handwritten repeat-marker Edge contract',
    'Incremental AI scan core contract',
    'Incremental AI scan database/edge contract',
    'Chat order draft database contract',
    'Chat order draft core contract',
    'Chat order draft Edge contract',
    'Chat order draft UI contract',
    'Chat order draft composer integration',
}
out = []
i = 0
while i < len(workflow_lines):
    line = workflow_lines[i]
    if line.startswith('      - name: '):
        label = line[len('      - name: '):].strip()
        if label in remove_steps:
            i += 1
            while i < len(workflow_lines) and not workflow_lines[i].startswith('      - name: '):
                i += 1
            continue
    out.append(line)
    i += 1
workflow_path.write_text(''.join(out), encoding='utf-8')

for rel in [
    'admin-ai-extract.js',
    'admin-order-draft.js',
    'order-scribe-client.js',
]:
    path = ROOT / rel
    if path.exists():
        path.unlink()

for rel in [
    'supabase/functions/v21-order-scribe',
    'supabase/functions/v21-order-draft',
    'supabase/functions/v21-order-scan',
    'supabase/functions/v21-ai-product-parser',
]:
    path = ROOT / rel
    if path.exists():
        shutil.rmtree(path)

for rel in [
    'tests/test_v21_ai_product_parser_core.mjs',
    'tests/test_v21_ai_product_catalog_search.mjs',
    'tests/test_v21_ai_order_summary.mjs',
    'tests/test_v21_ai_product_exact_key_prefix.mjs',
    'tests/test_v21_ai_product_parser_edge_contract.py',
    'tests/test_v21_ai_product_parser_db_contract.py',
    'tests/test_v21_order_scribe_core.mjs',
    'tests/test_v21_order_master_full.mjs',
    'tests/test_v21_order_scribe_inherit_marker.mjs',
    'tests/test_v21_order_scribe_client_runtime.js',
    'tests/test_v21_order_scribe_edge_contract.py',
    'tests/test_v21_grocery_reference.mjs',
    'tests/test_v21_order_scribe_inherit_marker_edge.py',
    'tests/test_v21_ai_incremental_scan_core.mjs',
    'tests/test_v21_ai_incremental_scan_db_contract.py',
    'tests/test_v21_order_draft_db_contract.py',
    'tests/test_v21_order_draft_core.mjs',
    'tests/test_v21_order_draft_edge_contract.py',
    'tests/test_v21_order_draft_ui.py',
    'tests/test_v21_order_draft_composer_integration.py',
]:
    path = ROOT / rel
    if path.exists():
        path.unlink()

subprocess.run([sys.executable, str(ROOT / 'tools/build_current_preview.py')], check=True, cwd=ROOT)
print('legacy Chat split/search/order implementation removed')
