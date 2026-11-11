'use strict';
// P1-SEARCH-287: privacy-scoped local search + canonical virtual-window jump.
// No Supabase call, IndexedDB mutation, media fetch or send action allowed.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const shell=fs.readFileSync('index.source.html','utf8');
const controller=fs.readFileSync('interaction-controller.js','utf8');
const searchUi=fs.readFileSync('conversation-search.js','utf8');
const searchCss=fs.readFileSync('conversation-search.css','utf8');
const quick=fs.readFileSync('admin-composer-actions.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');

const begin=app.indexOf('function conversationSearchKey(');
const revealStart=app.indexOf('function revealLoadedConversationMessage(',begin);
const bridgeStart=app.indexOf('window.V21ConversationBridge={',revealStart);
assert(begin>0&&revealStart>begin&&bridgeStart>revealStart);
const loaded=[
 {id:'one',clientId:'client-one',sender:'remote',text:'Chuyển khoản 850.000đ'},
 {id:'two',clientId:'client-two',sender:'self',text:'Hôm nay đã nhận tiền'},
 {id:'three',clientId:'client-three',sender:'remote',text:'chuyen khoan 461.000đ'},
 {id:'four',clientId:'client-four',sender:'remote',text:'Không liên quan'}
];
const auth={state:'AUTHENTICATED'};
const session={ready:true,currentContactId:'customer-a',currentConversationId:'conversation-a'};
const store={items:loaded,size:loaded.length};
const scope=vm.createContext({
 window:{V21AuthSessionStore:{snapshot:()=>auth},V21MessageStore:{snapshot:()=>session}},
 store,chatRouteVisible:()=>true
});
vm.runInContext(app.slice(begin,revealStart)+
 '\nglobalThis.testSearch=searchLoadedConversation;globalThis.key=conversationSearchKey;',scope);
assert.equal(scope.key('ĐÃ  NHẬN'), 'da nhan');
const found=scope.testSearch({query:'Chuyển   khoản'});
assert.equal(found.loaded,4);
assert.equal(found.total,2,'accent-insensitive match also finds unaccented bank message');
assert.deepEqual(Array.from(found.hits,h=>h.id),['client-three','client-one']);
assert.equal(found.partial,true,'do not claim whole history is indexed');
assert.equal(scope.testSearch({query:'x'}).total,0,'minimum two characters');
assert.equal(scope.testSearch({query:'không'}).total,1);
assert.equal(scope.testSearch({query:'chuyển khoản',limit:1}).total,2);
assert.equal(scope.testSearch({query:'chuyển khoản',limit:1}).hits.length,1);
auth.state='GUEST';
assert.equal(scope.testSearch({query:'chuyển khoản'}).loaded,0);
assert.deepEqual(Array.from(scope.testSearch({query:'chuyển khoản'}).hits),[]);
auth.state='AUTHENTICATED';session.ready=false;
assert.equal(scope.testSearch({query:'chuyển khoản'}).total,0);
session.ready=true;

const frames=[];
const highlights=[];
const node={
 dataset:{},getBoundingClientRect:()=>({top:240}),
 removeAttribute(key){delete this.dataset.searchTarget;highlights.push(key);}
};
const older={dataset:{searchTarget:'true'},removeAttribute(key){delete this.dataset.searchTarget;highlights.push(key);}};
const root={scrollTop:0,getBoundingClientRect:()=>({top:0})};
const scrolls=[],renderCalls=[];let cancelled=0,updates=0;
const view=vm.createContext({
 window:{V21AuthSessionStore:{snapshot:()=>auth},V21MessageStore:{snapshot:()=>session}},
 store,chatRouteVisible:()=>true,scrollGeometrySuspended:()=>false,
 cancelPendingTailTransaction:()=>{cancelled++},
 viewport:{setMode(value){this.mode=value}},
 VIEWPORT_STATES:{USER_AWAY:'USER_AWAY'},modeLabel:{textContent:''},
 renderWindow:options=>renderCalls.push(options),
 dataWindow:{estimateSpacer:()=>500},messageLayoutWidthPx:()=>340,heightCache:new Map(),
 regionTop:{getBoundingClientRect:()=>({height:72,bottom:72})},
 scrollRoot:root,threadContent:{offsetTop:130},
 setScrollTop:value=>{scrolls.push(value);root.scrollTop=value},
 requestAnimationFrame:callback=>{frames.push(callback);return frames.length},
 conversationViewEpoch:13,
 messageTurnById:id=>id==='one'?node:null,
 messageWindow:{querySelectorAll:()=>[older]},
 updateScrollFromEndControl:()=>{updates++}
});
vm.runInContext(app.slice(revealStart,bridgeStart)+
 '\nglobalThis.reveal=revealLoadedConversationMessage;',view);
assert.equal(view.reveal('client-one'),true);
assert.equal(cancelled,1);
assert.equal(view.viewport.mode,'USER_AWAY');
assert.equal(renderCalls.length,1);
assert.equal(renderCalls[0].anchorIndex,0);
assert.equal(renderCalls[0].preserve,'AUTO');
assert.equal(scrolls[0],130+500-72-12);
frames.shift()();
assert.equal(node.dataset.searchTarget,'true');
assert.equal(older.dataset.searchTarget,undefined);
assert.equal(scrolls.length,2,'central scroll owner handles estimate and DOM correction');
const before=scrolls.length;
assert.equal(view.reveal('missing'),false);
assert.equal(scrolls.length,before,'missing messages must not scroll');

assert(controller.includes("MESSAGE_SEARCH:'MESSAGE_SEARCH'"));
assert(app.includes('searchLoaded:searchLoadedConversation'));
assert(app.includes('revealLoadedMessage:revealLoadedConversationMessage'));
assert(searchUi.includes("const MODE='MESSAGE_SEARCH'"));
assert(searchUi.includes("a.appSessionId===b.appSessionId"));
assert(searchUi.includes('V21ConversationBridge?.searchLoaded?.'));
assert(searchUi.includes('V21ConversationBridge?.revealLoadedMessage?.'));
assert(searchUi.includes('document.addEventListener(\'v21-active-contact-change\''));
assert(searchUi.includes('document.addEventListener(\'v21-auth-state\''));
assert(searchUi.includes('v21-interaction-abort'));
assert(searchUi.includes('preview.textContent=hit.preview'));
assert(!searchUi.includes('.rpc('));
assert(!searchUi.includes('fetch('));
assert(shell.includes('data-build-source="conversation-search.js"'));
assert(shell.includes('data-build-source="conversation-search.css"'));
assert(quick.includes("find.textContent='Tìm tin trong hội thoại'"));
assert(searchUi.includes("node.className='message-forward-overlay conversation-search-overlay'"),
 'must reuse the platform keyboard/overlay owner');
assert(searchCss.includes('font-size:16px'));
assert(searchCss.includes('[data-mobile-keyboard="true"]'));
assert(searchCss.includes('[data-search-target="true"]'));
assert(sw.includes('SHELL_CACHE_EPOCH'));
console.log('P1-SEARCH-287 Vietnamese loaded-message search, privacy fence, virtualization jump and keyboard owner PASS');
