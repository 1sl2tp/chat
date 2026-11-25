import {test,expect} from '@playwright/test';
// Real host + real sandboxed 0v DOM; all data synthetic and network local only.
test('admin reads existing directory and messages in 0v; non-admin cannot',async({page})=>{
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('0v runtime:',e.stack||e.message)});page.on('console',m=>{if(m.type()==='error')console.log('0v console:',m.text())});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='http://127.0.0.1:8765')return route.abort();
  if(url.pathname!=='/qa-0v-host')return route.continue();
  const role=url.searchParams.get('role')==='user'?'user':'admin';
  return route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><button data-chat-0v-admin hidden>0v · Đọc dữ liệu CHAT</button><script>
  window.calls=[];
  let auth={state:'AUTHENTICATED',account:{id:'admin-id',role:${JSON.stringify(role)}},appSessionId:'fixture-private'};
  const db={rpc:async(name,args)=>{window.calls.push(name);if(name==='v21_contacts_sidebar')return {data:[{id:'c1',display_name:'Liên hệ kiểm thử',conversation_id:'room1',preview_text:'Tin đã có',latest_at:'2026-11-25T18:00:00Z'}]};if(name==='v21_sync_snapshot'&&args.p_conversation_id==='room1')return {data:{account_id:'admin-id',messages:[{id:'m1',conversation_id:'room1',sender_account_id:'c1',body:'Nội dung tin nhắn kiểm thử',created_at:'2026-11-25T18:00:00Z'}]}};throw Error('Unexpected RPC')}};
  window.V21AuthSessionStore={snapshot:()=>auth,getClient:()=>db};
  window.revoke=()=>{auth={state:'GUEST'};document.dispatchEvent(new Event('v21-auth-state'))};
  </script><script src="/chat-0v-read-host.js"></script></body></html>`});
 });
 await page.goto('/qa-0v-host?ui=0v');
 const frame=page.frameLocator('iframe[title="0v · Danh bạ và hội thoại"]');
 try{await expect(frame.getByText('Liên hệ kiểm thử',{exact:true})).toBeVisible()}catch(error){console.log('0v fixture state',await page.evaluate(()=>({calls:window.calls,body:document.body.innerText})));for(const f of page.frames())console.log('frame',f.url(),await f.locator('body').innerText().catch(()=>''));throw error}
 await expect(page.getByText('0v · Admin · 1 liên hệ · Chỉ đọc')).toBeVisible();
 await frame.getByText('Liên hệ kiểm thử',{exact:true}).click();
 await expect(frame.getByText('Nội dung tin nhắn kiểm thử',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.calls)).toEqual(['v21_contacts_sidebar','v21_sync_snapshot']);
 await page.evaluate(()=>window.revoke());
 await expect(page.locator('iframe')).toHaveCount(0);
 await page.goto('/qa-0v-host?ui=0v&role=user');
 await expect(page.locator('[data-chat-0v-admin]')).toBeHidden();
 await expect(page.locator('iframe')).toHaveCount(0);
 expect(await page.evaluate(()=>window.calls)).toEqual([]);
 expect(errors).toEqual([]);
});
