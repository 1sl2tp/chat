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
    setAttribute(name,value){this.attrs??={};this.attrs[name]=String(value);},
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
assert.deepEqual(Array.from(typoUnits.items,row=>[row.name,row.qty,row.unit]),[
 ['sữa thùg',5,'']
],'do not guess a misspelled container unit; preserve the literal name');
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

// CHAT-404: Two real colloquial bát request examples; keep the product
// text exact, retain the carton meaning privately, render SL as digits.
// "t" is interpreted as carton only in this narrow product construction;
// nearby price negotiation messages must not turn into stock requests.
const oneBat=analyze('Cho chị thêm 5t bát 1.8 kg');
assert.equal(oneBat?.kind,'order');
assert.deepEqual(Array.from(oneBat.items,item=>[item.name,item.qty,item.unit,item.review]),[
 ['bát 1.8 kg',5,'thùng',false]
]);
const anotherBat=analyze('Có bát 454 a 3 t');
assert.equal(anotherBat?.kind,'order');
assert.deepEqual(Array.from(anotherBat.items,item=>[item.name,item.qty,item.unit,item.review]),[
 ['bát 454',3,'thùng',true]
],'availability/question phrasing needs the yellow user review flag');
for(const [message,name,number] of [
 ['Cho chị thêm 5t bát 1.8 kg','bát 1.8 kg','5'],
 ['Có bát 454 a 3 t','bát 454','3']
]){
 const target=fakeNode('div');
 assert.equal(render(target,message),true);
 const row=target.children[0].children[1].children[1];
 assert.equal(row.children[1].textContent.startsWith(name),true);
 assert.equal(row.children[2].textContent,number,
  'quantity cell must not display the colloquial carton abbreviation');
 assert.equal(target.children[0].children.at(-1).children[1].textContent,message,
  'original customer words must be available unmodified');
}
assert.equal(analyze('Chị ko nhớ 1.075 hay 85'),null);
assert.equal(analyze('bát 1.8 2kg c mua dc gia nao nt e ạ. bat 454 1265'),null);
assert.equal(analyze('Bát 454 1265'),null,
 'price quotation must not be misread as order quantity');

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
  ['chua có',2,''],['ít',2,''],['không',2,''],['nha đam',2,''],
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
assert.match(css,/grid-template-columns:24px minmax\(0,1fr\) minmax\(32px,48px\)/);
assert.match(css,/\.incoming-brief-index/);
assert(!css.includes('.incoming-brief-unit'),'unit must not reserve a fourth column');
// CHAT-407: C Thúy's actual messages teach that numeric product names
// "1 kg" and "454" are NOT quantity, price or a stray message fragment.
const numericCartonText='Cho c 20 t 1 kg 10 t 454 còn đâu gửi lại kho';
const numericCartonRows=analyze(numericCartonText);
assert.equal(numericCartonRows?.kind,'order');
assert.deepEqual(Array.from(numericCartonRows.items,row=>[row.name,row.qty,row.unit]),[
 ['1 kg',20,'thùng'],['454',10,'thùng']
]);
assert.equal(numericCartonRows.groups.length,1,'return-to-stock instruction is a note');
assert.equal(numericCartonRows.groups[0].key,'other');
assert.deepEqual(Array.from(numericCartonRows.groups[0].rows),['còn đâu gửi lại kho']);
assert.equal(numericCartonRows.source,numericCartonText,'always retain original text');
const numericCartonBox=fakeNode('div');
assert.equal(render(numericCartonBox,numericCartonText),true);
const numericRows=numericCartonBox.children[0].children[1].children.slice(1);
assert.deepEqual(Array.from(numericRows,row=>[row.children[1].textContent,
 row.children[2].textContent]),[['1 kg','20'],['454','10']],
 'display exactly customer names, SL digits only, no extra quantity columns');
assert.equal(numericCartonBox.children[0].children.at(-1).children[1].textContent,
 numericCartonText,'original source must be available in the expanded message');
for(const [original,expectedName,qty] of [
 ['3 t kopikô sữa','kopikô sữa',3],
 ['Bốc c chị 3 t côsy bơ 600','côsy bơ 600',3]
]){
 const parsed=analyze(original);
 assert.equal(parsed?.kind,'order',original);
 assert.deepEqual(Array.from(parsed.items,x=>[x.name,x.qty,x.unit]),[
  [expectedName,qty,'thùng']
 ]);
 const rendered=fakeNode('div');
 assert.equal(render(rendered,original),true);
 const cells=rendered.children[0].children[1].children[1].children;
 assert.equal(cells[1].textContent,expectedName,
  '"600" belongs to the original product name, never the quantity');
 assert.equal(cells[2].textContent,String(qty));
}
const compactNumeric=analyze('Cho chị 20t 1kg 10t 454');
assert.deepEqual(Array.from(compactNumeric.items,x=>[x.name,x.qty]),[
 ['1kg',20],['454',10]
],'common no-space carton variant also works');
for(const message of [
 'Cho c 20 t 1 kg 10 t 1265',
 'Cho c 20 t 1kg 10 t giá 1265',
 'Giá bát 454 1265',
 'Bốc c chị báo giá côsy bơ 600'
]){
 assert.equal(analyze(message),null,
  'unknown numeric names and price talk must not become bogus orders: '+message);
}
// E Quyên layouts and a previously approved product parser must not change.
const kept=analyze('9 hạt ít đường 5 thùng\n9 hạt ko đường 2 thùng\n'+
 '5 grow plus vinamilk\n3 bò bịch ko đường\nproby to : 5 có, 2 việt quất\n'+
 '2 chua nha đam\n2 chua ít đường');
assert.deepEqual(Array.from(kept.items,x=>x.qty),[5,2,5,3,5,2,2,2]);

// CHAT-406: real message from E Quyên, with a tentative stock statement.
// The full sentence is preserved, but its product name is only "pepsi lon vàng".
const pepsiOriginal='Có pepsi lon vàng rồi thì phải, lấy tạm cho 10 thùng';
const pepsi=analyze(pepsiOriginal);
assert.equal(pepsi?.kind,'order');
assert.deepEqual(Array.from(pepsi.items,x=>[x.name,x.qty,x.unit,x.review]),[
 ['pepsi lon vàng',10,'thùng',true]
],'stock/question/request filler cannot be part of the merchandise name');
assert.equal(pepsi.source,pepsiOriginal,'never erase original conversation');
const pepsiTarget=fakeNode('div');
assert.equal(render(pepsiTarget,pepsiOriginal),true);
const pepsiRow=pepsiTarget.children[0].children[1].children[1];
assert.equal(pepsiRow.children[1].textContent.startsWith('pepsi lon vàng'),true);
assert.equal(pepsiRow.children[2].textContent,'10','SL stays digits, not ten cartons');
assert.equal(pepsiRow.dataset.needsReview,'true',
 '"rồi thì phải" must stay yellow for uncertainty about availability');
assert(pepsiRow.children[1].textContent.includes('Cần hướng dẫn'));
assert.equal(pepsiTarget.children[0].children.at(-1).children[1].textContent,
 pepsiOriginal,'the customer can view the exact unchanged sentence');
for(const nonOrder of [
 'Có pepsi lon vàng rồi thì phải',
 'Lấy tạm cho 10 thùng',
 'Giá pepsi lon vàng 10 thùng',
 'Giá pepsi lon vàng 10 thùng\nCảm ơn'
]){
 assert.equal(analyze(nonOrder),null,
  'price/chat phrasing cannot become a fake merchandise name: '+nonOrder);
}
// Existing E Quyên material must not regress or silently rename its products.
const existingLong=analyze(
 '1 thăng long mềm\n2 sao xanh lá\n2 sao xanh dương\n'+
 '5 thùng bò bé ít đường\n2 bò lít ko, 2 bò lít có');
assert.deepEqual(Array.from(existingLong.items,x=>[x.name,x.qty]),[
 ['thăng long mềm',1],['sao xanh lá',2],['sao xanh dương',2],
 ['bò bé ít đường',5],['bò lít ko',2],['bò lít có',2]
],'do not change the already-reviewed soft carton and milk examples');

// CHAT-405: a structured order is a neutral, centered timeline card for
// both senders, NOT a 70%-wide left/right text bubble. The viewport controls
// the available width and the numeric SL column stays narrow.
assert.match(app,/const allowed=message\?\.sender!=='self'\|\|[\s\S]*?formatter\?\.analyze\?\.\(message\?\.text\)\?\.kind==='order'/);
assert.equal((app.match(/const sharedList=messageBody\.dataset\.autoLayout==='order';/gu)||[]).length,2,
 'initial render and virtualized patch must share the same layout contract');
assert(app.includes("unit.dataset.sharedList=sharedList?'true':'false';"));
assert(app.includes("turn.dataset.sharedList=sharedList?'true':'false';"));
assert(app.includes("node.dataset.sharedList=sharedList?'true':'false';"));
assert(html.includes('#messageWindow .message-unit[data-shared-list="true"]{'));
assert(html.includes('width:min(100%,720px)'));
assert(html.includes('margin-inline:auto!important'));
assert(html.includes('#messageWindow .message-unit[data-shared-list="true"]>.message-text{'));
assert(html.includes('background:transparent!important'));
assert(html.includes('padding:0!important'));
assert(html.includes('#messageWindow .message-unit[data-shared-list="true"]>.message-sent-time{'));
assert(!css.includes('vw - '),'order grid must not rely on viewport instead of parent content');

assert(css.includes('.incoming-brief-item[data-needs-review="true"]'));
assert(css.includes('background:#ffe58a'));
assert(css.includes('.incoming-brief-note[data-needs-review="true"]'));

assert(!css.includes('background:red'));

// CHAT-408: C Trang Sữa has separate short request messages on the SAME
// Vietnam day. A combined read-only summary renders once after that date,
// never edits or sends customer messages and never mixes the account owner.
const {summarizeDay,renderDailySummary}=ui.V21IncomingMessageLayout;
for(const [message,name,count] of [
 ['2 sữa chua đường đen','sữa chua đường đen',2],
 ['1 sữa chua vnm ko đường','sữa chua vnm ko đường',1],
 ['1 susu lọ dâu','susu lọ dâu',1],
 ['1 thung susu lọ cam','susu lọ cam',1],
 ['3 lon canxi pro','canxi pro',3]
]){
 const parsed=analyze(message);
 assert.equal(parsed?.kind,'order',message+' is a valid one-item request');
 assert.deepEqual(Array.from(parsed.items,x=>[x.name,x.qty]),[[name,count]]);
}
assert.equal(analyze('Chân trâu'),null,'unknown standalone topping has no quantity');
const nov16=[
 {sender:'remote',text:'2 sữa chua đường đen',stamp:1000,key:'16-a'},
 {sender:'remote',text:'Chân trâu',stamp:4500,key:'16-b'},
 {sender:'remote',text:'1 sữa chua vnm ko đường',stamp:9000,key:'16-c'},
 {sender:'self',text:'5 thùng mì',stamp:9200,key:'16-self'},
 {sender:'remote',text:'5 probi be co dg',stamp:10000,key:'16-d'},
 {sender:'remote',text:'5 probi be it dg',stamp:11000,key:'16-e'},
 {sender:'remote',text:'Giá bên em bao nhiêu?',stamp:12000,key:'16-chat'},
 {sender:'remote',text:'3 lon canxi pro',stamp:13000,key:'16-f',media:{type:'image'}}
];
const sum16=summarizeDay(nov16);
assert.equal(sum16?.kind,'daily-order');
assert.equal(sum16.messageCount,4,'only source messages that contain stock rows');
assert.deepEqual(Array.from(sum16.items,x=>[x.name,x.qty]),[
 ['sữa chua đường đen',2],['sữa chua vnm ko đường',1],
 ['probi be co dg',5],['probi be it dg',5]
]);
assert.deepEqual(Array.from(sum16.notes,x=>[x.text,x.review]),[],
 'do not guess that a separate topping note belongs to an earlier item');
assert(sum16.items[2].review&&sum16.items[3].review,
 'uncertain flavor abbreviations are yellow, not rewritten');
const sum19=summarizeDay([
 {sender:'remote',text:'1 thung susu lọ cam',stamp:1000,key:'19-a'},
 {sender:'remote',text:'1 susu lọ dâu',stamp:2000,key:'19-b'},
 {sender:'remote',text:'3 lon canxi pro',stamp:3000,key:'19-c'},
 {sender:'self',text:'Tổng đã nhận 10.353',stamp:4000,key:'19-notorder'}
]);
assert.deepEqual(Array.from(sum19.items,x=>[x.name,x.qty]),[
 ['susu lọ cam',1],['susu lọ dâu',1],['canxi pro',3]
]);
assert.equal(sum19.messageCount,3);
const dailyTarget=fakeNode('div');
sum16.dayLabel='Thứ Hai, 16/11/2026';
assert.equal(renderDailySummary(dailyTarget,sum16),true);
assert(dailyTarget.textContent.includes('Tổng hợp lấy hàng · Thứ Hai, 16/11/2026'));
assert(dailyTarget.textContent.includes('chưa xác nhận hoặc tạo đơn'));
const dailyProducts=dailyTarget.children[0].children[1];
assert.deepEqual(Array.from(dailyProducts.children[0].children,x=>x.textContent),
 ['STT','Tên sản phẩm','SL']);
assert.deepEqual(Array.from(dailyProducts.children.slice(1),x=>x.children[2].textContent),
 ['2','1','5','5']);
assert(!dailyTarget.textContent.includes('Chân trâu'));
assert(dailyTarget.textContent.includes('Cần hướng dẫn'));
assert.equal(summarizeDay([{sender:'self',text:'5 thùng mì',key:'self'}]),null,
 'only incoming customer requests belong in the day summary');
assert.equal(summarizeDay([{sender:'remote',text:'Giá mì 1265',key:'price'}]),null,
 'a day of price discussions must not create an order summary');
const double=summarizeDay([
 {sender:'remote',text:'1 thung susu lọ cam',key:'A'},
 {sender:'remote',text:'1 thung susu lọ cam',key:'B'}
]);
assert.deepEqual(Array.from(double.items,x=>[x.name,x.qty]),[
 ['susu lọ cam',1],['susu lọ cam',1]
],'two literal lines stay separate; do not invent a sum or correction');
assert(double.items.every(x=>x.mentions===1));
assert(app.includes('function dailyStockSummariesByOwner(messages){'));
assert(app.includes('messageDateKey(messageTimestampMs(first))'));
assert(app.includes('messageDateKey(messageTimestampMs(messages[end]))===dayKey'));
assert(app.includes('result.set(stableMessageDomKey(messages[end-1]),summary)'));
assert(app.includes('function syncDailyStockSummary(node,summary){'));
assert(app.includes('node.querySelector(\':scope > .message-day-order-wrap\')'));
assert(app.includes('const dailyByOwner=dailyStockSummariesByOwner(store.items);'));
assert(app.includes('reconcileMessageWindow(win.items,dailyByOwner)'));
assert(app.includes('if(syncDailyStockSummary(node,summaryByOwner.get(key)||null))dirty.add(node)'));
assert(css.includes('#messageWindow .message-day-order-wrap{'));
assert(css.includes('width:min(100%,720px)'));
assert(!css.includes('position:sticky'),'the daily card must not overlay the keyboard');

assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|setInterval\(|localStorage|supabase\.|innerHTML\s*=/);
console.log('CHAT-381 incoming quantities, topic notes, safe original text PASS');
