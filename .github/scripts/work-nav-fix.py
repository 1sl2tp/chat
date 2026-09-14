from pathlib import Path

js_path = Path('work-customer-summary.js')
c = js_path.read_text('utf-8')

c = c.replace(
    "let forceOverview=false;\nlet mobileSwipe=null;",
    "let forceOverview=false;\nlet selectedWorkCustomerId='';\nlet mobileSwipe=null;",
    1,
)

c = c.replace(
    """function node(tag,className,text){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined&&text!==null)el.textContent=String(text);
  return el;
}

function showMobileDirectory""",
    """function node(tag,className,text){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined&&text!==null)el.textContent=String(text);
  return el;
}

function syncDirectoryChatTab(isDirectory=true){
  const tab=document.querySelector('[data-top-tab="chat"]');
  if(!tab)return false;
  if(!isDirectory)return true;
  const label=tab.querySelector('[data-chat-tab-label]');
  const avatar=tab.querySelector('[data-chat-tab-avatar]');
  if(label)label.textContent='Trò chuyện';
  if(avatar)avatar.hidden=true;
  tab.removeAttribute('data-contact-identity');
  return true;
}

function resetWorkSelectionForDirectory(){
  selectedWorkCustomerId='';
  forceOverview=true;
  return true;
}

function showMobileDirectory""",
    1,
)

c = c.replace(
    """  app.dataset.mobileDirectoryReason=String(reason||'directory');
  void window.V21ContactStore?.refresh?.();
  return true;""",
    """  app.dataset.mobileDirectoryReason=String(reason||'directory');
  resetWorkSelectionForDirectory();
  syncDirectoryChatTab(true);
  void window.V21ContactStore?.refresh?.();
  return true;""",
    1,
)

c = c.replace(
    """    if(dx>=MOBILE_CHAT_SWIPE_DISTANCE_PX){
      hideMobileDirectory('swipe-right-work');
      forceOverview=false;
      navigation()?.openWork?.();""",
    """    if(dx>=MOBILE_CHAT_SWIPE_DISTANCE_PX){
      hideMobileDirectory('swipe-right-work');
      selectedWorkCustomerId='';
      forceOverview=false;
      navigation()?.openWork?.();""",
    1,
)

old = """function renderOverviewRow(summary,index){
  const row=summary.row||{};
  const card=node('div','work-summary-overview-row work-summary-customer work-summary-overview-grid-row');
  card.dataset.customerId=String(row.customer_id||'');
  card.append(node('span','work-summary-overview-index',String(index+1)));
  card.append(node('strong','work-summary-overview-name',row.display_name||row.username||'Khách hàng'));
  card.append(node('span','work-summary-overview-code',formatNumber(summary.codeCount)));
  card.append(node('span','work-summary-overview-product',formatNumber(summary.productCount)));
  return card;
}
"""
new = """function renderOverviewRow(summary,index){
  const row=summary.row||{};
  const customerId=String(row.customer_id||'');
  const card=node('div','work-summary-overview-row work-summary-customer work-summary-overview-grid-row');
  card.dataset.customerId=customerId;
  card.append(node('span','work-summary-overview-index',String(index+1)));
  const name=node('button','work-summary-overview-name',row.display_name||row.username||'Khách hàng');
  name.type='button';
  name.setAttribute('data-work-summary-customer',customerId);
  name.setAttribute('aria-label',`Mở công việc của ${row.display_name||row.username||'khách hàng'}`);
  card.append(name);
  card.append(node('span','work-summary-overview-code',formatNumber(summary.codeCount)));
  card.append(node('span','work-summary-overview-product',formatNumber(summary.productCount)));
  return card;
}
"""
if old not in c:
    raise SystemExit('renderOverviewRow anchor missing')
c = c.replace(old, new, 1)

old = """  grid.append(head);
  summaries.forEach((summary,index)=>grid.append(renderOverviewRow(summary,index)));

  const totalCodes=summaries.reduce((sum,summary)=>sum+summary.codeCount,0);"""
new = """  grid.append(head);
  const listScroll=node('div','work-summary-overview-list-scroll');
  summaries.forEach((summary,index)=>listScroll.append(renderOverviewRow(summary,index)));
  grid.append(listScroll);

  const totalCodes=summaries.reduce((sum,summary)=>sum+summary.codeCount,0);"""
if old not in c:
    raise SystemExit('overview list anchor missing')
c = c.replace(old, new, 1)

old = """function renderCurrent(){
  const contact=activeContact();
  if(forceOverview||!contact?.id){
    renderOverview(rowsCache);
    return;
  }
  const row=rowsCache.find(item=>String(item?.customer_id||'')===String(contact.id))||null;
  renderCustomerDetail(row,contact);
}
"""
new = """function openOverviewCustomer(customerId){
  const id=String(customerId||'');
  const row=rowsCache.find(item=>String(item?.customer_id||'')===id)||null;
  if(!id||!row)return false;
  selectedWorkCustomerId=id;
  forceOverview=false;
  renderCustomerDetail(row,{id,name:row.display_name||row.username||'Khách hàng'});
  return true;
}

function renderCurrent(){
  const contact=activeContact();
  if(forceOverview){
    renderOverview(rowsCache);
    return;
  }
  const targetId=String(selectedWorkCustomerId||contact?.id||'');
  if(!targetId){
    renderOverview(rowsCache);
    return;
  }
  const row=rowsCache.find(item=>String(item?.customer_id||'')===targetId)||null;
  const context=selectedWorkCustomerId
    ?{id:targetId,name:row?.display_name||row?.username||'Khách hàng'}
    :contact;
  renderCustomerDetail(row,context);
}
"""
if old not in c:
    raise SystemExit('renderCurrent anchor missing')
c = c.replace(old, new, 1)

c = c.replace(
    """document.addEventListener('v21-auth-state',()=>{
  forceOverview=false;
  void refresh('auth-state');
});
document.addEventListener('v21-active-contact-change',()=>{
  hideMobileDirectory('contact-selected');
  forceOverview=false;
  renderCurrent();
});""",
    """document.addEventListener('v21-auth-state',()=>{
  selectedWorkCustomerId='';
  forceOverview=false;
  void refresh('auth-state');
});
document.addEventListener('v21-active-contact-change',()=>{
  hideMobileDirectory('contact-selected');
  selectedWorkCustomerId='';
  forceOverview=false;
  renderCurrent();
});""",
    1,
)

c = c.replace(
    """  const all=event.target?.closest?.('[data-work-summary-all]');
  if(all){
    forceOverview=true;
    renderOverview(rowsCache);
    return;
  }

  const toggle=""",
    """  const all=event.target?.closest?.('[data-work-summary-all]');
  if(all){
    selectedWorkCustomerId='';
    forceOverview=true;
    renderOverview(rowsCache);
    return;
  }

  const overviewCustomer=event.target?.closest?.('[data-work-summary-customer]');
  if(overviewCustomer){
    openOverviewCustomer(overviewCustomer.getAttribute('data-work-summary-customer'));
    return;
  }

  const toggle=""",
    1,
)

c = c.replace(
    """  const workTarget=event.target?.closest?.('[data-top-tab="work"],[data-nav-target="work"]');
  if(workTarget){
    hideMobileDirectory('work-tab');
    pinWorkOuterScroll();
    void refresh('open-work');
  }""",
    """  const workTarget=event.target?.closest?.('[data-top-tab="work"],[data-nav-target="work"]');
  if(workTarget){
    const app=document.getElementById('appShell');
    if(app?.dataset.mobileDirectory==='true')resetWorkSelectionForDirectory();
    hideMobileDirectory('work-tab');
    pinWorkOuterScroll();
    void refresh('open-work');
  }""",
    1,
)

js_path.write_text(c, 'utf-8')

css_path = Path('work-customer-summary.css')
s = css_path.read_text('utf-8')

s = s.replace(
    ".work-summary-overview{\n  display:block;\n}",
    ".work-summary-overview{\n  display:block;\n  overflow:hidden;\n}",
    1,
)

s = s.replace(
    """.work-summary-overview-grid{
  min-width:0;
  border:1px solid var(--theme-border-default);
  border-radius:12px;
  overflow:hidden;
  background:var(--theme-surface-primary);
}""",
    """.work-summary-overview-grid{
  width:100%;
  height:100%;
  min-width:0;
  min-height:0;
  display:flex;
  flex-direction:column;
  border:1px solid var(--theme-border-default);
  border-radius:12px;
  overflow:hidden;
  background:var(--theme-surface-primary);
}""",
    1,
)

anchor = """.work-summary-overview-head{
  min-height:36px;
  background:var(--theme-surface-secondary);
  color:var(--theme-content-secondary);
  font-size:12px;
  line-height:16px;
  font-weight:600;
}
"""
insert = anchor + """.work-summary-overview-head,
.work-summary-overview-grand-total{
  flex:0 0 auto;
}
.work-summary-overview-list-scroll{
  min-height:0;
  flex:1 1 auto;
  overflow-y:auto;
  overflow-x:hidden;
  overscroll-behavior:contain;
  scrollbar-width:thin;
  border-top:1px solid color-mix(in srgb,var(--theme-border-default) 70%,transparent);
}
"""
if anchor not in s:
    raise SystemExit('overview head css anchor missing')
s = s.replace(anchor, insert, 1)

s = s.replace(
    """.work-summary-overview-name{
  min-width:0;
  padding:0 8px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-size:13px;
  line-height:18px;
  font-weight:600;
}""",
    """.work-summary-overview-name{
  min-width:0;
  padding:0 8px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  border:0;
  background:transparent;
  color:inherit;
  text-align:left;
  font-family:inherit;
  font-size:13px;
  line-height:18px;
  font-weight:600;
  cursor:pointer;
}""",
    1,
)

css_path.write_text(s, 'utf-8')
