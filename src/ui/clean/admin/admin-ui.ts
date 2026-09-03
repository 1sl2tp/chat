import type { AdminInboxItem } from '../../../admin/contracts'
import './admin.css'

export interface CleanAdminWorkspace {
  root: HTMLElement
  inboxScreen: HTMLElement
  chatScreen: HTMLElement
  chatHost: HTMLElement
  list: HTMLElement
  search: HTMLInputElement
  notificationButton: HTMLButtonElement
  logoutButton: HTMLButtonElement
  callHost: HTMLElement
  diagnostic: HTMLElement
  showInbox(): void
  showChat(): void
  renderInbox(items: AdminInboxItem[], onSelect: (id: string) => void): void
}

function initials(value: string): string {
  return value.trim().split(/\s+/).slice(0,2).map(p => p[0]?.toUpperCase() ?? '').join('') || 'U'
}

function timeLabel(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})
}

export function createCleanAdminWorkspace(root: HTMLElement): CleanAdminWorkspace {
  root.innerHTML = `
    <main class="clean-admin" data-clean-app="admin">
      <section id="clean-admin-inbox-screen" class="clean-admin__screen">
        <header class="clean-admin__top">
          <div class="clean-admin__brand"><div class="clean-admin__logo">💬</div><div><strong>TAPHOA</strong><span>Hỗ trợ</span></div></div>
          <div class="clean-admin__actions"><button id="clean-admin-notification" class="clean-admin__button" type="button" hidden>Bật thông báo</button><button id="clean-admin-logout" class="clean-admin__button" type="button">Thoát</button></div>
        </header>
        <div class="clean-admin__inbox-head">
          <div class="clean-admin__inbox-title"><h1>Hộp thư hỗ trợ</h1></div>
          <input id="clean-admin-search" class="clean-admin__search" placeholder="Tìm kiếm" autocomplete="off">
        </div>
        <div id="clean-admin-list" class="clean-admin__list"></div>
      </section>
      <section id="clean-admin-chat-screen" class="clean-admin__screen" hidden><div id="clean-admin-chat" class="clean-admin__chat"></div></section>
    </main>
    <div id="clean-admin-call"></div>
    <span id="clean-admin-diagnostic" class="clean-diagnostic"></span>
  `
  const $ = <T extends Element>(selector:string):T => { const el=root.querySelector<T>(selector); if(!el) throw new Error(`Missing ${selector}`); return el }
  const inboxScreen=$('#clean-admin-inbox-screen') as HTMLElement
  const chatScreen=$('#clean-admin-chat-screen') as HTMLElement
  const list=$('#clean-admin-list') as HTMLElement
  const search=$('#clean-admin-search') as HTMLInputElement
  let currentItems: AdminInboxItem[]=[]
  let currentSelect:(id:string)=>void=()=>{}

  const paint=()=>{
    const q=search.value.trim().toLowerCase()
    const items=currentItems.filter(item=>!q || `${item.displayName??''} ${item.username??''} ${item.lastMessageText??''}`.toLowerCase().includes(q))
    list.replaceChildren()
    if(!items.length){ const empty=document.createElement('div'); empty.className='clean-admin__empty'; empty.textContent='Không có User.'; list.append(empty); return }
    for(const item of items){
      const button=document.createElement('button'); button.type='button'; button.className='clean-admin__row'
      const avatar=document.createElement('div'); avatar.className='clean-admin__avatar'; avatar.textContent=initials(item.displayName||item.username||'User')
      const main=document.createElement('div'); main.className='clean-admin__row-main'
      const line=document.createElement('div'); line.className='clean-admin__row-line'
      const name=document.createElement('div'); name.className='clean-admin__row-name'; name.textContent=item.displayName||item.username||'User'
      const time=document.createElement('span'); time.className='clean-admin__time'; time.textContent=timeLabel(item.lastMessageAt)
      const preview=document.createElement('div'); preview.className='clean-admin__preview'; preview.textContent=item.lastMessageText||'Chưa có tin nhắn'
      line.append(name,time); main.append(line,preview)
      if(item.unreadCount>0){ const badge=document.createElement('span'); badge.className='clean-admin__badge'; badge.textContent=String(item.unreadCount); main.append(badge) }
      button.append(avatar,main); button.addEventListener('click',()=>currentSelect(item.conversationId)); list.append(button)
    }
  }
  search.addEventListener('input',paint)
  return {
    root,inboxScreen,chatScreen,chatHost:$('#clean-admin-chat') as HTMLElement,list,search,
    notificationButton:$('#clean-admin-notification') as HTMLButtonElement,
    logoutButton:$('#clean-admin-logout') as HTMLButtonElement,
    callHost:$('#clean-admin-call') as HTMLElement,
    diagnostic:$('#clean-admin-diagnostic') as HTMLElement,
    showInbox(){ inboxScreen.hidden=false; chatScreen.hidden=true },
    showChat(){ inboxScreen.hidden=true; chatScreen.hidden=false },
    renderInbox(items,onSelect){ currentItems=items; currentSelect=onSelect; paint() },
  }
}

export interface CleanAdminLogin { login: HTMLInputElement; password: HTMLInputElement; button: HTMLButtonElement; error: HTMLElement; form: HTMLFormElement }
export function createCleanAdminLogin(root: HTMLElement, message=''): CleanAdminLogin {
  root.innerHTML=`<main class="clean-admin-login"><form id="clean-admin-login-form"><div class="clean-admin-login__logo">💬</div><h1>Đăng nhập</h1><label>Tài khoản<input id="clean-admin-login" value="admin" autocomplete="username"></label><label>Mật khẩu<input id="clean-admin-password" type="password" autocomplete="current-password"></label><p id="clean-admin-login-error">${message}</p><button type="submit">Đăng nhập</button></form></main>`
  const form=root.querySelector<HTMLFormElement>('#clean-admin-login-form')!; return { form,login:root.querySelector<HTMLInputElement>('#clean-admin-login')!,password:root.querySelector<HTMLInputElement>('#clean-admin-password')!,button:form.querySelector<HTMLButtonElement>('button')!,error:root.querySelector<HTMLElement>('#clean-admin-login-error')! }
}
