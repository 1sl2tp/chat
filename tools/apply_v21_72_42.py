from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    p=ROOT/path
    text=p.read_text('utf-8')
    count=text.count(old)
    assert count==1, f'{path}: expected 1 match, got {count}'
    p.write_text(text.replace(old,new,1),'utf-8')

# 1) Directory scrollbar + compact mobile footer + logout icon + admin context DOM/CSS.
source=ROOT/'index.source.html'
s=source.read_text('utf-8')
old='.wm-sidebar-navigation{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}'
new='''.wm-sidebar-navigation{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.28) transparent;scrollbar-gutter:stable}\n.wm-sidebar-navigation::-webkit-scrollbar{width:3px}\n.wm-sidebar-navigation::-webkit-scrollbar-track{background:transparent}\n.wm-sidebar-navigation::-webkit-scrollbar-thumb{background:rgba(0,0,0,.28);border-radius:999px}'''
assert s.count(old)==1, s.count(old)
s=s.replace(old,new,1)

old_footer='''.shell-sidebar-account-footer{grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:6px;padding:6px 0 max(6px,env(safe-area-inset-bottom))}\n.shell-sidebar-account-footer .shell-sidebar-account-main,.shell-sidebar-account-footer .shell-sidebar-account-action,.shell-sidebar-account-footer .zalo-account-admin-open{width:100%;min-width:0;height:40px;min-height:40px;padding:0 8px;border-radius:12px;font-size:.82rem;font-weight:600}\n.shell-sidebar-account-footer .shell-sidebar-account-main{display:flex;align-items:center;justify-content:center;background:var(--theme-surface-secondary)}\n.shell-sidebar-account-footer .shell-sidebar-account-avatar,.shell-sidebar-account-footer .shell-sidebar-account-copy span,.shell-sidebar-account-footer .shell-sidebar-account-chevron{display:none}\n.shell-sidebar-account-footer .shell-sidebar-account-copy strong{display:block;min-width:0;font-size:.82rem;line-height:1rem;font-weight:600;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.shell-sidebar-account-footer .zalo-account-admin-open{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'''
new_footer='''.shell-sidebar-account-footer{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 42px;gap:4px;padding:4px 0 max(4px,env(safe-area-inset-bottom));align-items:center}\n.shell-sidebar-account-footer .shell-sidebar-account-main,.shell-sidebar-account-footer .shell-sidebar-account-action,.shell-sidebar-account-footer .zalo-account-admin-open{width:100%;min-width:0;height:38px;min-height:38px;padding:0 8px;border-radius:11px;font-size:.8rem;font-weight:600}\n.shell-sidebar-account-footer .shell-sidebar-account-main{display:flex;align-items:center;justify-content:center;background:var(--theme-surface-secondary)}\n.shell-sidebar-account-footer .shell-sidebar-account-avatar,.shell-sidebar-account-footer .shell-sidebar-account-copy span,.shell-sidebar-account-footer .shell-sidebar-account-chevron{display:none}\n.shell-sidebar-account-footer .shell-sidebar-account-copy strong{display:block;min-width:0;font-size:.8rem;line-height:1rem;font-weight:600;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.shell-sidebar-account-footer .zalo-account-admin-open{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.shell-sidebar-account-footer[data-state="authenticated"] .shell-sidebar-account-action{width:42px;min-width:42px;padding:0}\n.shell-sidebar-account-footer[data-state="authenticated"] .shell-sidebar-account-action [data-account-action-label]{display:none}\n.shell-sidebar-logout-icon{display:none;width:18px;height:18px;pointer-events:none}\n.shell-sidebar-account-footer[data-state="authenticated"] .shell-sidebar-logout-icon{display:block}\n@media(max-width:67.999rem){#shellNavigationLayer .shell-navigation-panel{height:100dvh;max-height:100dvh}}'''
assert s.count(old_footer)==1, s.count(old_footer)
s=s.replace(old_footer,new_footer,1)

old_top='''.compact-top-grid{\n  display:grid;\n  grid-template-columns:40px minmax(0,1fr) auto;\n  align-items:center;\n  column-gap:8px;\n  width:100%;\n  height:100%;\n  margin-inline:0;\n  box-sizing:border-box;\n}'''
new_top='''.compact-top-grid{\n  display:grid;\n  grid-template-columns:40px minmax(0,1fr) auto;\n  align-items:center;\n  column-gap:8px;\n  width:100%;\n  height:100%;\n  margin-inline:0;\n  box-sizing:border-box;\n  position:relative;\n}\n.active-contact-context{grid-column:2;grid-row:1;align-self:end;justify-self:center;max-width:min(72vw,260px);margin-bottom:2px;color:var(--theme-content-tertiary);font-size:11px;line-height:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}\n.active-contact-context[hidden]{display:none}\n#appShell[data-admin-contact-context="true"] .top-mode-switch{transform:translateY(-9px)}\n.compact-top-grid:has(.call-focus-slot:not([data-call-ui-state="idle"])) .active-contact-context{display:none}'''
assert s.count(old_top)==1, s.count(old_top)
s=s.replace(old_top,new_top,1)

old_mobile='''@media (max-width:480px){\n  .compact-top-grid{column-gap:6px}\n  .top-mode-tab{font-size:12.5px;padding-inline:6px}'''
new_mobile='''@media (max-width:480px){\n  .compact-top-grid{column-gap:6px}\n  .active-contact-context{max-width:210px;font-size:10.5px}\n  .top-mode-tab{font-size:12.5px;padding-inline:6px}'''
assert s.count(old_mobile)==1, s.count(old_mobile)
s=s.replace(old_mobile,new_mobile,1)

old_tabs='''        <div class="top-mode-switch" role="tablist" aria-label="Chế độ làm việc">\n          <button type="button" class="top-mode-tab" role="tab" aria-selected="false" data-top-tab="chat" data-nav-target="chat">Trò chuyện</button>\n          <button type="button" class="top-mode-tab" role="tab" aria-selected="false" data-top-tab="work" data-nav-target="work">Công việc</button>\n        </div>\n\n        <div class="call-focus-slot"'''
new_tabs='''        <div class="top-mode-switch" role="tablist" aria-label="Chế độ làm việc">\n          <button type="button" class="top-mode-tab" role="tab" aria-selected="false" data-top-tab="chat" data-nav-target="chat">Trò chuyện</button>\n          <button type="button" class="top-mode-tab" role="tab" aria-selected="false" data-top-tab="work" data-nav-target="work">Công việc</button>\n        </div>\n        <div class="active-contact-context" data-active-contact-context hidden aria-live="polite"><span data-active-contact-context-text></span></div>\n\n        <div class="call-focus-slot"'''
assert s.count(old_tabs)==1, s.count(old_tabs)
s=s.replace(old_tabs,new_tabs,1)

old_logout='''            <button class="shell-sidebar-account-action" type="button" data-auth-command="login.open">\n              <span data-account-action-label>Đăng nhập</span>\n            </button>'''
new_logout='''            <button class="shell-sidebar-account-action" type="button" data-auth-command="login.open">\n              <svg class="shell-sidebar-logout-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M13 8l4 4-4 4M8 12h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>\n              <span data-account-action-label>Đăng nhập</span>\n            </button>'''
assert s.count(old_logout)==1, s.count(old_logout)
s=s.replace(old_logout,new_logout,1)
source.write_text(s,'utf-8')

# 2) Shell: admin-only active-contact context in chat header.
shell=ROOT/'shell.js'
sh=shell.read_text('utf-8')
old='''function applyRoutePresentation(){\n  screenHost.dataset.route=route;\n  appShell.dataset.route=route;\n  const chatNodes=document.querySelectorAll('[data-chat-thread-node]');\n  const workView=document.getElementById('workThreadView');\n  for(const node of chatNodes)node.hidden=route!=='chat';\n  if(workView)workView.hidden=route!=='work';\n  renderTopTabs();\n  renderCallFocus();\n}'''
new='''function applyRoutePresentation(){\n  screenHost.dataset.route=route;\n  appShell.dataset.route=route;\n  const chatNodes=document.querySelectorAll('[data-chat-thread-node]');\n  const workView=document.getElementById('workThreadView');\n  for(const node of chatNodes)node.hidden=route!=='chat';\n  if(workView)workView.hidden=route!=='work';\n  renderTopTabs();\n  renderActiveContactContext();\n  renderCallFocus();\n}'''
assert sh.count(old)==1, sh.count(old)
sh=sh.replace(old,new,1)

old='''function renderTopTabs(){\n  for(const tab of document.querySelectorAll('[data-top-tab]')){\n    tab.setAttribute('aria-selected',String(tab.dataset.topTab===route));\n  }\n}'''
new='''function renderTopTabs(){\n  for(const tab of document.querySelectorAll('[data-top-tab]')){\n    tab.setAttribute('aria-selected',String(tab.dataset.topTab===route));\n  }\n}\n\nfunction renderActiveContactContext(){\n  const node=document.querySelector('[data-active-contact-context]');\n  const text=node?.querySelector('[data-active-contact-context-text]');\n  const visible=Boolean(\n    authState==='AUTHENTICATED' &&\n    authAccount?.role==='admin' &&\n    route==='chat' &&\n    activeContact?.id\n  );\n  if(appShell)appShell.dataset.adminContactContext=String(visible);\n  if(!node)return visible;\n  node.hidden=!visible;\n  if(text)text.textContent=visible?`Đang chat · ${String(activeContact?.name||'Liên hệ')}`:'';\n  return visible;\n}'''
assert sh.count(old)==1, sh.count(old)
sh=sh.replace(old,new,1)

old='''  renderCallFocus();\n  syncContactActiveState();\n  persistScreenSession();'''
new='''  renderCallFocus();\n  renderActiveContactContext();\n  syncContactActiveState();\n  persistScreenSession();'''
assert sh.count(old)==1, sh.count(old)
sh=sh.replace(old,new,1)

old='''  setAccount(account){\n    authAccount=account?{...account}:null;\n    this.renderAccountFooter();\n  },'''
new='''  setAccount(account){\n    authAccount=account?{...account}:null;\n    this.renderAccountFooter();\n    renderActiveContactContext();\n  },'''
assert sh.count(old)==1, sh.count(old)
sh=sh.replace(old,new,1)
shell.write_text(sh,'utf-8')

# 3) App: display-only common emoticons, applied only to non-link text nodes.
app=ROOT/'app.js'
a=app.read_text('utf-8')
old="const MESSAGE_LINK_RE=/https?:\\/\\/[^\\s<]+/giu;"
new="""const DISPLAY_EMOTICONS=Object.freeze({\n  ':)':'🙂',':-)':'🙂',\n  ':D':'😄',':-D':'😄',\n  ';)':'😉',';-)':'😉',\n  ':(':'🙁',':-(':'🙁',\n  ':P':'😛',':-P':'😛',':p':'😛',':-p':'😛',\n  ':~':'😅'\n});\nconst DISPLAY_EMOTICON_RE=/(^|[\\s([{])(:-\\)|:\\)|:-D|:D|;-\\)|;\\)|:-\\(|:\\(|:-P|:P|:-p|:p|:~)(?=$|[\\s)\\]},.!?])/gu;\n\nfunction normalizeDisplayEmoticons(value){\n  return String(value??'').replace(DISPLAY_EMOTICON_RE,(_match,prefix,token)=>`${prefix}${DISPLAY_EMOTICONS[token]||token}`);\n}\n\nconst MESSAGE_LINK_RE=/https?:\\/\\/[^\\s<]+/giu;"""
assert a.count(old)==1, a.count(old)
a=a.replace(old,new,1)
old="if(start>cursor)container.appendChild(document.createTextNode(text.slice(cursor,start)));"
new="if(start>cursor)container.appendChild(document.createTextNode(normalizeDisplayEmoticons(text.slice(cursor,start))));"
assert a.count(old)==1, a.count(old)
a=a.replace(old,new,1)
old="if(cursor<text.length)container.appendChild(document.createTextNode(text.slice(cursor)));"
new="if(cursor<text.length)container.appendChild(document.createTextNode(normalizeDisplayEmoticons(text.slice(cursor))));"
assert a.count(old)==1, a.count(old)
a=a.replace(old,new,1)
app.write_text(a,'utf-8')

print('V21.72.42 bounded production patch applied')
