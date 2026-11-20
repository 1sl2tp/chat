'use strict';
// CHAT-415 — display-only sentence casing across both message directions.
// All checks run offline with no real messages, DB or network requests.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('chat-message-case.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const layout=fs.readFileSync('incoming-message-layout.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const win={};
vm.runInNewContext(source,{window:win});
const formatter=win.V21ChatMessageCase;
assert(formatter&&typeof formatter.sentenceCase==='function');
const cases=[
 ['CHỊ ĐÓNG CỬA LÂU RỒI','Chị đóng cửa lâu rồi'],
 ['CHỊ CÓ NHÉ','Chị có nhé'],
 ['CHỦ NHẬT CHỊ NGHỈ','Chủ nhật chị nghỉ'],
 ['vâng ạ. mai e qua sau ạ','Vâng ạ. mai e qua sau ạ'],
 ['bao thăng long màu xanh 8 bao nhé','Bao thăng long màu xanh 8 bao nhé'],
 ['OMACHI SỐT 5\nCHO 6 MƯỜI THÙNG','Omachi sốt 5\nCho 6 mười thùng'],
 ['STK 123456789 | QR 1200 | KH','STK 123456789 | QR 1200 | KH'],
 ['MÃ AB12 ĐƠN DG121','Mã AB12 đơn DG121'],
 ['GỬI https://Example.COM/Kh?ID=123 NHÉ','Gửi https://Example.COM/Kh?ID=123 nhé'],
 ['EMAIL Test.Person+AB@Example.COM XONG','Email Test.Person+AB@Example.COM xong'],
 ['LỊCH HẸN 20/11/2026, 08:30','Lịch hẹn 20/11/2026, 08:30'],
 ['1. SỮA CHUA XANH\n2) OMACHI 10','1. Sữa chua xanh\n2) Omachi 10'],
 ['iPhone 16 VÀ YouTube','iPhone 16 và YouTube']
];
for(const [input,expected] of cases){
 assert.equal(formatter.sentenceCase(input),expected,'wrong case for '+input);
 assert.equal(formatter.sentenceCase(formatter.sentenceCase(input)),expected,
  'normalization must be idempotent');
}
const text=(str)=>({nodeType:3,textContent:str});
const el=(tag,children=[],className='')=>({
 nodeType:1,childNodes:children,
 matches:(q)=>q.split(',').some(part=>part.trim()==='code'&&tag==='code'||
  part.includes('.message-link')&&className.includes('message-link')||
  part.includes('.message-inline-code')&&className.includes('message-inline-code')||
  part.includes('.incoming-brief-original-text')&&className.includes('incoming-brief-original-text')),
 closest:()=>null,
 get textContent(){return this.childNodes.map(c=>c.textContent).join('')}
});
const raw=text('CHỊ ');
const strongText=text('ĐÓNG CỬA');
const suffix=text(' LÂU RỒI');
const rich=el('div',[raw,el('strong',[strongText]),suffix],'message-rich-line');
const product=el('span',[text('bao thăng long màu xanh 8 bao nhé')],'incoming-brief-product');
const codeNode=el('code',[text('CASE_SENSITIVE_123')]);
const mixed=el('div',[text('GỬI '),codeNode,text(' VÀ XEM')],'message-rich-line');
const linkNode=el('a',[text('https://Example.COM/Kh?ID=AB12')],'message-link');
const linked=el('div',[text('XEM '),linkNode,text(' NHÉ')],'message-rich-line');
const original=el('div',[text('CHỊ NGHỈ')],'incoming-brief-original-text');
original.closest=()=>true;
const root={querySelectorAll:()=>[rich,product,mixed,linked,original]};
formatter.normalizeRendered(root);
assert.equal(rich.textContent,'Chị đóng cửa lâu rồi');
assert.equal(product.textContent,'Bao thăng long màu xanh 8 bao nhé');
assert.equal(mixed.textContent,'Gửi CASE_SENSITIVE_123 và xem');
assert.equal(linked.textContent,'Xem https://Example.COM/Kh?ID=AB12 nhé');
assert.equal(original.textContent,'CHỊ NGHỈ','source transcript is immutable');
assert(html.includes('data-build-source="chat-message-case.js"'));
assert(html.indexOf('data-build-source="chat-message-case.js"')<
 html.indexOf('data-build-source="incoming-message-layout.js"'));
assert(html.indexOf('data-build-source="chat-message-case.js"')<
 html.indexOf('data-build-source="app.js"'));
assert(app.includes("window.V21ChatMessageCase?.sentenceCase?.(replyTo.text"));
assert(app.includes("window.V21ChatMessageCase?.normalizeRendered?.(container)"));
assert(app.includes("window.V21ChatMessageCase?.normalizeRendered?.(rendered)"));
assert(layout.match(/window\.V21ChatMessageCase\?\.normalizeRendered\?\.\(root\)/g).length===2,
 'structured items and daily summary must use same visual casing');
assert(app.includes('renderConversationMessageBody(messageBody,message);'),
 'both message creation and mutation must reuse same casing owner');
assert(!source.includes('.update(')&&!source.includes('.insert('),
 'display formatter may not perform persistence');
console.log('CHAT-415 sentence-case display on A, B and summary: PASS');
