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
// CHAT-399: actual 20/11 customer stock request. The screenshot displayed
// only two unit-suffixed rows; every other quantity-first/variant row was
// incorrectly classified as "Lời nhắn". No catalog substitutions are allowed.
const realOrder=[
 '9 hạt ít đường 5 thùng',
 '9 hạt ko đường 2 thùng',
 '5 grow plus vinamilk',
 '3 bò bịch ko đường',
 'proby to : 5 có, 2 việt quất',
 '2 chua nha đam',
 '2 chua ít đường'
].join('\n');
const parsedReal=analyze(realOrder);
assert.equal(parsedReal.kind,'order');
assert.equal(parsedReal.items.length,8,'all eight stock lines including Proby variants');
assert.deepEqual(Array.from(parsedReal.items,row=>[row.name,row.qty,row.unit]),[
 ['9 hạt ít đường',5,'thùng'],
 ['9 hạt ko đường',2,'thùng'],
 ['grow plus vinamilk',5,''],
 ['bò bịch ko đường',3,''],
 ['proby to có',5,''],
 ['proby to việt quất',2,''],
 ['chua nha đam',2,''],
 ['chua ít đường',2,'']
]);
assert.equal(parsedReal.groups.length,0,'no product may land in Lời nhắn');
assert.equal(parsedReal.source,realOrder,'source must remain byte-for-byte reversible');
assert.equal(parsedReal.items[4].review,true,'unclear "có" must be marked, not corrected');
assert.equal(parsedReal.items[0].qty,5,'numeric product name "9 hạt" is not quantity 9');
const orderTarget=fakeNode('div');
assert.equal(render(orderTarget,realOrder),true);
const orderRoot=orderTarget.children[0];
const grid=orderRoot.children[1];
assert.deepEqual(Array.from(grid.children[0].children,x=>x.textContent),['STT','Tên sản phẩm','SL','Quy cách']);
assert.equal(grid.children.length,9,'header + eight four-column rows');
assert.equal(grid.children[1].children[0].textContent,'1');
assert.equal(grid.children[1].children[2].textContent,'5');
assert.equal(grid.children[3].children[3].textContent,'—','unknown unit must not be invented');
assert.equal(orderRoot.children.at(-1).children[1].textContent,realOrder);
const numericNoQty=analyze('Lấy hàng\n9 hạt ít đường\n2 chua ít đường');
assert.equal(numericNoQty.items.length,1,'bare numeric product name stays undecided');
assert.equal(numericNoQty.groups[0].rows[0],'9 hạt ít đường');
const compact=analyze('Báo hàng\n1. 9 hạt ít đường: 5 thùng\n2. 9 hạt ko đường: 2 thùng');
assert.deepEqual(Array.from(compact.items,row=>row.qty),[5,2]);
assert.equal(compact.groups.length,0);
const inline=analyze('Lấy hàng\nMì 2 thùng, Bánh 3 gói');
assert.deepEqual(Array.from(inline.items,row=>[row.name,row.qty]),[['Mì',2],['Bánh',3]]);
const noCueBare=analyze('5 grow plus vinamilk\n3 bò bịch ko đường\n2 chua nha đam');
assert.deepEqual(Array.from(noCueBare.items,row=>row.qty),[5,3,2]);
assert.equal(analyze('9 hạt ít đường\n10 hạt không đường'),null,
 'numeric product names alone are never invented order quantities');

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
assert.match(css,/grid-template-columns:23px minmax\(0,1fr\) minmax\(26px,36px\) minmax\(42px,55px\)/);
assert.match(css,/\.incoming-brief-index/);
assert.match(css,/\.incoming-brief-unit/);
assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|setInterval\(|localStorage|supabase\.|innerHTML\s*=/);
console.log('CHAT-381 incoming quantities, topic notes, safe original text PASS');
