'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const start=app.indexOf('function parseZaloSharedPhoneCard(value){');
const end=app.indexOf('function renderMessageBody(container,value){',start);
assert(start>0&&end>start,'Zalo card helpers missing');

class Node{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.listeners={};this.attributes={};
    this.isConnected=true;this.textContent='';this.style={};}
  append(...children){this.children.push(...children);}
  appendChild(child){this.children.push(child);return child;}
  replaceChildren(...children){this.children=children;}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  select(){this.selected=true;}
  remove(){this.isConnected=false;}
}
const clipboard=[];
const document={
  createElement:tag=>new Node(tag),
  body:{appendChild(){}},
  execCommand:()=>true
};
const context={
  document,URL,
  navigator:{clipboard:{async writeText(value){clipboard.push(value);}}},
  window:{setTimeout(){}}
};
vm.createContext(context);
vm.runInContext(app.slice(start,end),context);
const parse=context.parseZaloSharedPhoneCard;
const sample='📇 Danh thiếp Zalo\nDuyệt Dola\nSố điện thoại: 0763807901\nhttps://zaloapp.com';
assert.equal(parse(sample).number,'0763807901');
assert.equal(parse(sample.replace(/\\n/g,'\n')).number,'0763807901');
assert.equal(parse('Danh thiếp Zalo\nKhách\nSố điện thoại: +84 (763) 807-901').number,'+84763807901');
assert.equal(parse('📇 Danh thiếp Zalo\nKhách\nSố điện thoại: 090 123 4567').number,'0901234567');
assert.equal(parse('Báo giá\nSố điện thoại: 0763807901'),null,'regular messages are not treated as contact cards');
assert.equal(parse('📇 Danh thiếp Zalo\nKhách\nSố điện thoại: 1234'),null,'invalid phone rejected');
assert.equal(parse('📇 Danh thiếp Zalo\nKhách\nSố điện thoại: 0763807901\nhttps://not-zalo.example'),null,'unexpected link keeps original text');
assert.equal(parse('📇 Danh thiếp Zalo\nKhách\nSố điện thoại: 0763807901\nGiao hàng lúc 9 giờ'),null,'custom note stays visible');
assert.equal(parse('📇 Danh thiếp Zalo\nKhách\nhttps://zaloapp.com'),null,'contact without a phone remains unchanged');
assert(html.includes('.message-zalo-phone-number{'),'phone UI styling required');
assert(app.includes('if(phoneCard)return renderZaloSharedPhoneCard(container,phoneCard)'),'same renderer for old and incoming messages');
const root=new Node('div');
context.renderZaloSharedPhoneCard(root,parse(sample));
const row=root.children[0];
assert.equal(row.className,'message-zalo-phone');
assert.equal(row.children.length,2);
const [call,copy]=row.children;
assert.equal(call.href,'tel:0763807901');
assert.equal(call.textContent,'0763807901');
assert.equal(copy.textContent,'Sao chép');
assert.equal(root.dataset.contactCard,'zalo-phone');
let bubbling=false;
call.listeners.click({stopPropagation(){bubbling=true;}});
assert(bubbling,'calling must not invoke message actions');
let copiedBubble=false;
copy.listeners.click({stopPropagation(){copiedBubble=true;}});
(async()=>{
  await new Promise(resolve=>setImmediate(resolve));
  assert(copiedBubble);
  assert.equal(clipboard.at(-1),'0763807901','copy button copies digits only');
  assert.equal(copy.textContent,'Đã sao chép');
  context.navigator.clipboard.writeText=async()=>{throw Error('Clipboard API blocked in Safari');};
  const fallback=new Node('button');
  const ok=await context.copyZaloSharedPhone('0763807901',fallback);
  assert(ok,'Safari/PWA legacy copy fallback works');
  assert.equal(fallback.textContent,'Đã sao chép');
  console.log('Zalo shared phone renderer: tel link, copy button, fallback, input guards PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
