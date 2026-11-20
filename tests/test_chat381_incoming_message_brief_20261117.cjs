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
assert.deepEqual(Array.from(analyze('Sữa 2th').items,row=>[row.name,row.qty,row.unit]),[
 ['Sữa',2,'thùng']
],'single clear product-and-carton request must be readable');
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
assert.deepEqual(Array.from(grid.children[0].children,x=>x.textContent),['STT','Tên sản phẩm','SL']);
assert.equal(grid.children.length,9,'header + eight three-column rows');
assert.equal(grid.children[1].children[0].textContent,'1');
assert.equal(grid.children[1].children[2].textContent,'5','SL must be numeric only, never combined with the unit');
assert.equal(grid.children[3].children[2].textContent,'5','unknown unit must not be invented');
assert.equal(grid.children[2].children[2].textContent,'2');
assert.equal(grid.children[1].children[1].textContent,'9 hạt ít đường');
assert.equal(grid.children[2].children[1].textContent,'9 hạt ko đường');
assert.equal(grid.children[7].children[1].textContent.startsWith('chua nha đam'),true);
assert.equal(grid.children[7].children[2].textContent,'2');
assert.equal(grid.children[8].children[1].textContent.startsWith('chua ít đường'),true);
assert.equal(grid.children[8].children[2].textContent,'2');
assert.deepEqual(Array.from(grid.children.slice(1),x=>x.children[2].textContent),[
 '5','2','5','3','5','2','2','2'
],'numeric-only SL across all eight stock rows');
assert.equal(parsedReal.items[0].unit,'thùng','unit still understood internally');
assert.equal(parsedReal.items[0].name,'9 hạt ít đường','unit never appended to product name');

assert.equal(orderRoot.children.at(-1).children[1].textContent,realOrder);
const numericNoQty=analyze('Lấy hàng\n9 hạt ít đường\n2 chua ít đường');
assert.equal(numericNoQty.items.length,1,'bare numeric product name stays undecided');
assert.equal(numericNoQty.groups[0].rows[0],'9 hạt ít đường');
const compact=analyze('Báo hàng\n1. 9 hạt ít đường: 5 thùng\n2. 9 hạt ko đường: 2 thùng');
assert.deepEqual(Array.from(compact.items,row=>row.qty),[5,2]);
assert.equal(compact.groups.length,0);
const inline=analyze('Lấy hàng\nMì 2 thùng, Bánh 3 gói');
assert.deepEqual(Array.from(inline.items,row=>[row.name,row.qty]),[['Mì',2],['Bánh',3]]);
const unitlessColon=analyze('Lấy hàng\n9 hạt ít đường: 2\nSữa chua: 3');
assert.deepEqual(Array.from(unitlessColon.items,row=>[row.name,row.qty,row.unit]),[
 ['9 hạt ít đường',2,''],['Sữa chua',3,'']
]);
assert.equal(analyze('Giá sữa: 120\nGiá mì: 95'),null,
 'unlabeled price colon numbers must not be guessed as order quantities');
const noCueBare=analyze('5 grow plus vinamilk\n3 bò bịch ko đường\n2 chua nha đam');
assert.deepEqual(Array.from(noCueBare.items,row=>row.qty),[5,3,2]);
// CHAT-400: slot-based interpretation regardless of quantity position.
const mixedFormats=analyze([
 'Lấy hàng',
 'Sữa thùng 5',
 '5 sữa thùng',
 '5th sữa',
 'Sữa 5th',
 'Sữa 180ml 5 thùng',
 '5 Sữa 180ml',
 '3 bò bịch ko đường',
 '2 bộ bàn'
].join('\n'));
assert.deepEqual(Array.from(mixedFormats.items,row=>[row.name,row.qty,row.unit]),[
 ['Sữa',5,'thùng'],['sữa',5,'thùng'],
 ['sữa',5,'thùng'],['Sữa',5,'thùng'],
 ['Sữa 180ml',5,'thùng'],['Sữa 180ml',5,''],
 ['bò bịch ko đường',3,''],['bàn',2,'bộ']
]);
const typoUnits=analyze('Lấy hàng\nSữa 5 thùg\n5thùg sữa\n5 sữa thùg');
assert.deepEqual(Array.from(typoUnits.items,row=>row.unit),['thùng','thùng','thùng']);
assert(typoUnits.items.every(row=>row.review===true),
 'uncertain unit typo is flagged for review, original text unchanged');
assert.equal(typoUnits.source,'Lấy hàng\nSữa 5 thùg\n5thùg sữa\n5 sữa thùg');
const notCorrected=analyze('Lấy hàng\n3 bò bịch ko đường\n5 bô sữa');
assert.deepEqual(Array.from(notCorrected.items,row=>[row.name,row.unit]),[
 ['bò bịch ko đường',''],['bô sữa','']
],'"bò" and "bô" are not the unit "bộ"');
assert.equal(analyze('5 thùg sữa\nSữa lỗi ngày mai'),null,
 'a typo alone cannot turn an unconfirmed chat into a purchase');

assert.equal(analyze('9 hạt ít đường\n10 hạt không đường'),null,
 'numeric product names alone are never invented order quantities');

// CHAT-401: User-confirmed order lead phrases, grouped variants and sizes.
// Review is intentionally yellow, not a silent product-name correction.
const requestSingles=[
 ['cho tôi 2 thùng sữa','sữa',2,'thùng'],
 ['cho thêm 3 sữa','sữa',3,''],
 ['cho chị 2 thùng sữa','sữa',2,'thùng'],
 ['lấy thêm 5 thùng mì','mì',5,'thùng'],
 ['Cho em 2bao my vị','my vị',2,'bao']
];
for(const [message,name,qty,unit] of requestSingles){
 const decoded=analyze(message);
 assert.equal(decoded?.kind,'order',message+' is an explicit request');
 assert.deepEqual(Array.from(decoded.items,x=>[x.name,x.qty,x.unit]),[[name,qty,unit]]);
 assert.equal(decoded.source,message,'request source text cannot be altered');
}
const availability=analyze('đang có 3 thùng sữa');
assert.equal(availability.kind,'availability','inventory statement is not a purchase request');
assert.equal(availability.items[0].review,true,'ambiguous available-stock intent needs guidance');
const sizes=analyze('bát 1kg 83\nbát 454g 63');
assert.deepEqual(Array.from(sizes.items,x=>[x.name,x.qty,x.unit]),[
 ['bát 1kg',83,''],['bát 454g',63,'']
]);
assert.equal(analyze('Bát 454g 63').items[0].qty,63,
 'user-verified sized-product shorthand is a valid single-line order');
assert.equal(analyze('Giá bát 1kg 83\nGiá bát 454g 63'),null,
 'price statements cannot become ordered quantities');
const reverseVariants=analyze('probi to: trắng 2, vq 2');
assert.deepEqual(Array.from(reverseVariants.items,x=>[x.name,x.qty,x.review]),[
 ['probi to trắng',2,false],['probi vq',2,false]
],'confirmed short variant name remains vq, not an invented expansion');
const historicVariants=analyze('Probi to : 5 có, 2 ít, 2 việt quất');
assert.deepEqual(Array.from(historicVariants.items,x=>[x.name,x.qty,x.review]),[
 ['Probi to có',5,true],['Probi to ít',2,true],
 ['Probi to việt quất',2,false]
]);
const dưa=analyze('Probi bé: 2 dưa, 1 dâu, 1 dứa');
assert.equal(dưa.items[0].review,true,'dưa must not silently expand to dưa gang');
const variantView=fakeNode('div');
assert.equal(render(variantView,'Probi to : 5 có, 2 ít, 2 việt quất'),true);
const variantRows=variantView.children[0].children[1].children;
assert.equal(variantRows[1].dataset.needsReview,'true','first unsure variant is marked yellow');
assert.equal(variantRows[2].dataset.needsReview,'true','second unsure variant is marked yellow');
assert.notEqual(variantRows[3].dataset.needsReview,'true','known term is not falsely flagged');
assert(variantRows[1].textContent.includes('Cần hướng dẫn'));
assert(variantView.textContent.includes('Probi to : 5 có, 2 ít, 2 việt quất'));
const dotted=analyze('probi to có 5. ít 2. việt quất 2');
assert.deepEqual(Array.from(dotted.items,x=>[x.name,x.qty,x.review]),[
 ['probi to có',5,true],['probi to ít',2,true],['probi to việt quất',2,false]
],'real Probi dotted grammar resolves variants, but short labels remain yellow');

// CHAT-403: Only STT, customer's original name, numeric SL. Carton/mixed
// shorthand remains in parsing evidence but is never rendered as a unit label.
for(const message of ['5 thùng 9 hạt ít đường\n2 chua nha đam',
                      '1 thùng milo này\n2 thùng sài gòn bạc',
                      '6 thùng TH bịch: 2 có, 2 ít, 2 không']){
 const mount=fakeNode('div');
 assert.equal(render(mount,message),true);
 const rows=mount.children[0].children[1].children.slice(1);
 assert(rows.every(row=>/^\d+$/u.test(row.children[2].textContent)),
   'SL must consist only of digits, even when units or variants exist');
 assert(rows.every(row=>row.children.length===3),
   'a separate unit column must not return');
}

// CHAT-402: E Quyên corpus regression. Samples contain only product wording,
// not customer identifiers, personal data or actual order records.
const quyenCorpus=[
 {text:'20 thùng indomie',rows:[['indomie',20,'thùng']]},
 {text:'2 bao hướng dương',rows:[['hướng dương',2,'bao']]},
 {text:'Thêm\n10 cây ngựa\n10 sài gòn đào',rows:[
  ['ngựa',10,'cây'],['sài gòn đào',10,'']
 ]},
 {text:'10 th bé ít đường\n10 th bé có đường',rows:[
  ['th bé ít đường',10,''],['th bé có đường',10,'']
 ]},
 {text:'1 thùng milo này',rows:[['milo này',1,'thùng']]},
 {text:'2 chua có, 2 ít, 2 không, 2 nha đam\nProby to: 3 có, 1 ít',rows:[
  ['chua có',2,''],['chua ít',2,''],['chua không',2,''],['chua nha đam',2,''],
  ['Proby to có',3,''],['Proby to ít',1,'']
 ]},
 {text:'1 Chinsu trắng + 1 chinsu đỏ\n10 omachi sườn',rows:[
  ['Chinsu trắng',1,''],['chinsu đỏ',1,''],['omachi sườn',10,'']
 ]},
 {text:'6 thùng TH bịch: 2 có, 2 ít, 2 không',rows:[
  ['TH bịch có',2,'thùng'],['TH bịch ít',2,'thùng'],['TH bịch không',2,'thùng']
 ]},
 {text:'10 milo to có đường',rows:[['milo to có đường',10,'']]}
];
for(const {text:raw,rows} of quyenCorpus){
 const parsed=analyze(raw);
 assert.equal(parsed?.kind,'order',raw+' should be an order-shaped layout');
 assert.deepEqual(Array.from(parsed.items,item=>[item.name,item.qty,item.unit]),rows,
  'customer shorthand must keep name, quantity, and container distinct');
 assert.equal(parsed.source,raw,'source must remain fully reversible');
}
assert.equal(analyze('1 thùng milo này').items[0].review,true,
 'demonstrative suffix is highlighted for customer-specific interpretation');
assert(analyze('10 th bé ít đường\n10 th bé có đường').items.every(row=>row.review),
 'TH brand ambiguity must be reviewed, not interpreted as thùng');
const unresolved=analyze('3 lau sàn sunlight 1l : chanh, quế, lavender\n5 thùng indomie');
assert.equal(unresolved.kind,'order');
assert.equal(unresolved.items.length,1);
assert.deepEqual(Array.from(unresolved.groups[0].rows),[
 '3 lau sàn sunlight 1l : chanh, quế, lavender'
]);
const unresolvedTarget=fakeNode('div');
assert.equal(render(unresolvedTarget,unresolved.source),true);
const unknownNote=unresolvedTarget.children[0].children.find(x=>x.tagName==='section').children[1];
assert.equal(unknownNote.dataset.needsReview,'true',
 'unreadable numeric item must be visibly highlighted yellow');
assert(unknownNote.textContent.includes('Cần hướng dẫn'));
const noProduct=analyze('cho 10 thùng vậy');
assert.equal(noProduct.kind,'review','do not invent a product from a demonstrative');
assert.equal(noProduct.items.length,0);
assert.equal(analyze('Thêm'),null,'instruction without products is not an order');
assert.equal(analyze('Giao hàng mai nhé\nCảm ơn'),null,
 'general chat must not get highlighted as a purchase');

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
assert.match(css,/grid-template-columns:23px minmax\(0,1fr\) minmax\(64px,82px\)/);
assert.match(css,/\.incoming-brief-index/);
assert(!css.includes('.incoming-brief-unit'),'unit must not reserve a fourth column');
assert(css.includes('.incoming-brief-item[data-needs-review="true"]'));
assert(css.includes('background:#ffe58a'));
assert(css.includes('.incoming-brief-note[data-needs-review="true"]'));

assert(!css.includes('background:red'));

assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|setInterval\(|localStorage|supabase\.|innerHTML\s*=/);
console.log('CHAT-381 incoming quantities, topic notes, safe original text PASS');
