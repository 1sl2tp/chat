'use strict';
// CALL-187: header call → native tel: from a trusted user click, while the
// Admin phone editor lives behind the existing overflow menu. No real RPC
// or call is performed here; scoped fake numbers exercise the real JS.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const phone=fs.readFileSync('contact-phone-admin.js','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
assert(phone.includes("btn.addEventListener('click',dialCurrent);"),
 'the visible call icon must NOT invoke the edit modal');
assert(!phone.includes("btn.addEventListener('click',()=>void open());"));
assert(phone.includes("void readPhone(String(current().id)).catch("),
 'Admin number preloads on contact selection, not on the dial click');
assert(phone.includes("document.addEventListener('v21-active-contact-change',()=>{dismiss();clearNotice();attach()});"));
assert(phone.includes("document.addEventListener('v21-auth-state',()=>{cache.clear();pending.clear();dismiss();clearNotice();attach()});"));
assert(phone.includes("window.V21ContactPhoneAdmin=Object.freeze({open,valid,dial:dialCurrent,refresh:attach});"));
assert(phone.includes("const request=rpc(id).then(data=>{"));
assert(phone.includes("if(phoneContextActive(id,account,session)){"));
assert(phone.includes("const key=account+':'+session+':'+String(id||'');"));
assert(phone.includes("String(current()?.id||'')===String(id)"));
assert(phone.includes("const session=String(au().appSessionId||'');"));
assert(phone.includes("if(!overlay.isConnected||!phoneContextActive(id,account)||String(au().appSessionId||'')!==session)"));
assert(phone.includes("if(!overlay.isConnected||!phoneContextActive(id,account,session))return;"),
 'late save cannot cache a number for another contact/session');
assert(phone.includes("actions.append(save);\n if(missed)actions.append(dial,chat);"),
 'normal editor only saves; missed Chat call retains distinct callback options');
assert(phone.includes("window.location.href='tel:'+number;"),
 'the iPhone dial should call the normalized primary number');

const header=html.slice(html.indexOf('id="regionTop"'),html.indexOf('<!-- UX-192:'));
assert(header.includes('data-chat-header-action="phone" hidden'));
assert(header.includes('Số điện thoại khách hàng</span>'));
assert(header.includes('Gọi qua Chat</span>'),
 'the existing realtime call is explicitly distinguished from iPhone call');
assert(shell.includes("const phoneMenuItem=document.querySelector('[data-chat-header-action=\"phone\"]');"));
assert(shell.includes("if(phoneMenuItem)phoneMenuItem.hidden=true;"));
assert(shell.includes("if(phoneMenuItem)phoneMenuItem.hidden=!(item?.role==='user'&&!isPinnedBankReportContact(item));"));
assert(shell.includes("if(action==='phone'&&authState==='AUTHENTICATED'&&authAccount?.role==='admin'&&activeContact?.id)"));
assert(shell.includes("window.V21ContactPhoneAdmin?.open?.({"));
assert(shell.includes("opener:document.querySelector('[data-chat-header-more]')"));
assert(shell.includes("if(action==='audio'&&requireAuthenticatedCommand())"),
 'Chat audio entry still retains its owner');

const patch=css.slice(css.indexOf('/* CALL-187'));
assert(patch.includes('@media(max-width:63.999rem){'));
assert(patch.includes('flex:0 0 94px!important;'));
assert(patch.includes('width:94px!important;'));
assert(patch.includes('gap:6px;'));
assert(patch.includes('flex:0 0 44px;')&&patch.includes('min-height:44px;'));
assert(!patch.includes('position:fixed;'), 'header must not own viewport or keyboard');
assert(sw.includes("const SHELL_CACHE_EPOCH='pwa-chat-native-iphone-dial-call187-20261113';"));

const dialStart=phone.indexOf('function dialCurrent(){');
const dialEnd=phone.indexOf('function attach(){',dialStart);
assert(dialStart>0&&dialEnd>dialStart);
let user='u1',account='a1',session='s1',isAdmin=true;
const scope=()=>account+':'+session+':'+user;
const cache=new Map(),pending=new Map(),notices=[];
let clearCount=0;
const location={href:''};
const sandbox={
 current:()=>({id:user}),admin:()=>isAdmin,cache,pending,
 scopeKey:scope,notice:message=>notices.push(message),
 clearNotice:()=>{clearCount++},normalize:value=>String(value||'').replace(/[\\s().-]/g,''),
 valid:value=>/^\\+?[0-9]{9,15}$/.test(value),
 window:{location}
};
vm.runInNewContext(phone.slice(dialStart,dialEnd)+'\nglobalThis.dial=dialCurrent;',sandbox);
assert.equal(sandbox.dial(),false,'without a number, user sees hint rather than editing modal');
assert.match(notices.at(-1),/Vào …/);
assert.equal(location.href,'');
pending.set(scope(),Promise.resolve());
assert.equal(sandbox.dial(),false,'pending RPC must never auto-open tel');
assert.match(notices.at(-1),/Đang tải/);
pending.clear();
cache.set(scope(),{phone_primary:'0944 228-336'});
assert.equal(sandbox.dial(),true);
assert.equal(location.href,'tel:0944228336','normalized iPhone tel URL');
assert.equal(clearCount,1);
location.href='';
cache.set(scope(),{phone_primary:'09javascript:123'});
assert.equal(sandbox.dial(),false,'fail closed on malformed or injected numbers');
assert.equal(location.href,'');
user='u2';
assert.equal(sandbox.dial(),false,'switching contacts must not dial the previous number');
isAdmin=false;
cache.set(scope(),{phone_primary:'0987654321'});
assert.equal(sandbox.dial(),false,'user role cannot read or dial private Admin number');

const readStart=phone.indexOf('async function readPhone(');
const readEnd=phone.indexOf('function dialCurrent(){',readStart);
let active='uA',acct='adminA',sess='sA';
const remoteCache=new Map(),remotePending=new Map();
const resolvers=new Map(),paint=[];
const remote={
 cache:remoteCache,pending:remotePending,
 au:()=>({account:{id:acct},appSessionId:sess}),
 rpc:id=>new Promise(resolve=>resolvers.set(id,resolve)),
 phoneContextActive:(id,owner,ticket)=>id===active&&owner===acct&&ticket===sess,
 updateDialButton:()=>paint.push(active)
};
vm.runInNewContext(phone.slice(readStart,readEnd)+'\nglobalThis.read=readPhone;',remote);
async function run(){
 const first=remote.read('uA','adminA','sA');
 active='uB';
 const second=remote.read('uB','adminA','sA');
 resolvers.get('uA')({phone_primary:'0900000001'});
 await first;
 assert(!remoteCache.has('adminA:sA:uA'),'stale response cannot populate active private cache');
 resolvers.get('uB')({phone_primary:'0900000002'});
 await second;
 assert.equal(remoteCache.get('adminA:sA:uB').phone_primary,'0900000002');
 acct='adminB';
 const third=remote.read('uB','adminB','sB');
 sess='sB';
 resolvers.get('uB')({phone_primary:'0900000003'});
 await third;
 assert(!remoteCache.has('adminB:sB:uB'),'session change before read must block unrelated number');
 console.log('CALL-187: native trusted-click dial, private number prefetch, stale auth guard and overflow editor PASS');
}
run().catch(err=>{console.error(err);process.exitCode=1;});
