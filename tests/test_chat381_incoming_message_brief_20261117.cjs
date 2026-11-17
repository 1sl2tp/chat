'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('incoming-message-layout.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const css=fs.readFileSync('incoming-message-layout.css','utf8');
const ui={};
function fakeNode(tag){
  let content='';
  return{
    tagName:tag,dataset:{},children:[],className:'',listeners:{},
    set textContent(value){content=String(value);this.children=[];},
    get textContent(){return content+this.children.map(x=>x.textContent).join('');},
    append(...nodes){this.children.push(...nodes);},
    replaceChildren(...nodes){this.children=[...nodes];},
    addEventListener(event,callback){this.listeners[event]=callback;}
  };
}
vm.runInNewContext(source,{window:ui,document:{createElement:fakeNode}});
const {analyze,render}=ui.V21IncomingMessageLayout;
assert.equal(typeof analyze,'function');
assert.equal(typeof render,'function');
const sample='Báo lấy hàng\nSữa tươi 2th\n3 thùng mì\nBánh x 4\nGiao hàng: chiều nay\nGhi chú: còn thiếu báo lại';
const result=analyze(sample);
assert.equal(result.kind,'order');
assert.deepEqual(Array.from(result.items,row=>[row.name,row.qty,row.unit]),[
 ['Sữa tươi',2,'thùng'],['mì',3,'thùng'],['Bánh',4,'']
]);
assert.equal(result.groups.find(x=>x.key==='delivery').rows[0],'chiều nay');
assert.equal(result.groups.find(x=>x.key==='note').rows[0],'còn thiếu báo lại');
const alt=analyze('Lấy hàng\n2 sữa\nMì 2 thùng\nBánh 2 gói');
assert.deepEqual(Array.from(alt.items,row=>row.qty),[2,2,2]);
assert.deepEqual(Array.from(alt.items,row=>row.unit),['','thùng','gói']);
assert.equal(analyze('e bán\ncho 12 358\ncutas 12 363\ncosy 480 335'),null,
 'product codes and prices must not become quantities');
assert.equal(analyze('Mì chính bát 2\nCosy 480 335'),null);
assert.equal(analyze('Lấy hàng\n2th\n2 thùng'),null,
 'standalone quantities without item names must not be guessed');
assert.equal(analyze('Sữa 2th'),null,'ordinary single line retains original view');
assert.equal(analyze('Hôm nay nhắn nhau\nMai gặp nhé'),null);
const topic=analyze('Giao hàng: trước 16h\nGhi chú: báo thiếu hàng\nThanh toán: chuyển khoản');
assert.equal(topic.kind,'topics');
assert.deepEqual(Array.from(topic.groups,x=>x.key),['delivery','note','payment']);
const malicious='Lấy hàng\n2 thùng sữa\n3 gói bánh\nGhi chú: <script>alert(1)</script>';
const target=fakeNode('div');
assert.equal(render(target,malicious),true);
assert.equal(target.dataset.autoLayout,'order');
const last=target.children[0].children.at(-1);
assert.equal(last.children[1].textContent,malicious,'original characters must remain exact');
assert(target.textContent.includes('<script>alert(1)</script>'));
assert.equal(render(fakeNode('div'),'Chào anh\nCảm ơn'),false);
assert.match(app,/function renderConversationMessageBody\(container,message\)/);
assert.equal((app.match(/renderConversationMessageBody\(messageBody,message\);/g)||[]).length,2);
assert(html.includes('data-build-source="incoming-message-layout.js"'));
assert(html.includes('data-build-source="incoming-message-layout.css"'));
assert(html.indexOf('data-build-source="incoming-message-layout.js"')<
 html.indexOf('data-build-source="app.js"'));
assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto/);
assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|setInterval\(|localStorage|supabase\.|innerHTML\s*=/);
console.log('CHAT-381 incoming quantities, topic notes, safe original text PASS');
