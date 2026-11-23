'use strict';
// CHAT-425: the two user-supplied forms are independent, read-only sources.
// No customer message, order, payment, supplier invoice or DB write.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const parser=fs.readFileSync('incoming-message-layout.js','utf8');
const client=fs.readFileSync('chat-stock-image-read.js','utf8');
const edge=fs.readFileSync('supabase/functions/v21-chat-stock-image/index.ts','utf8');
const pure=fs.readFileSync('supabase/functions/v21-chat-stock-image/chat-stock-read.mjs','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const win={};
new Function('window','document',parser)(win,{});
const stock=win.V21IncomingMessageLayout;
// CHAT-436: payments and quantity-only packaging must not become stock rows.
for(const message of ['200k','2 triệu','2 & 200k','2 thùng','2 thùng mà chưa rõ hàng','Chuyển khoản 200.000đ']){
 const result=stock.analyze('Lấy hàng\\n'+message);
 assert(!result?.items?.length,'non-merchandise must not create item: '+message);
}
for(const [message,name,qty] of [
 ['Lấy hàng\\n2 thùng Proby','Proby',2],
 ['Lấy hàng\\nProby 400ml 2','Proby 400ml',2],
 ['Lấy hàng\\nThọ 1.2kg 1','Thọ 1.2kg',1]
]){
 const result=stock.analyze(message);
 assert(result?.items?.some(item=>item.name===name&&item.qty===qty),'preserve real merchandise: '+message);
}

for(const [input,name,qty,unit] of [
 ['Mi miket - 316 *5 thùng','Mi miket - 316',5,'thùng'],
 ['Cháo gấu đỏ gà - 150 *5','Cháo gấu đỏ gà - 150',5,''],
 ['Tương ớt 250 - 370 *5 THÙNG','Tương ớt 250 - 370',5,'thùng'],
 ['Tương ớt 1KG *5 THÙNG','Tương ớt 1KG',5,'thùng'],
 ['Dầu mezan 1L 549*10 thùng','Dầu mezan 1L 549',10,'thùng'],
 ['Sút 400*3 thùng','Sút 400',3,'thùng'],
 ['Chia men to *1 thùng','Chia men to',1,'thùng'],
 ['Om 1.2 *3 thùng','Om 1.2',3,'thùng'],
 ['Milo *5','Milo',5,'']
]){
 const found=stock.analyze(input);
 assert.equal(found?.kind,'order',input);
 assert.equal(found.items.length,1,input);
 assert.equal(found.items[0].name,name,input+' keep literal prefix');
 assert.equal(found.items[0].qty,qty,input+' number right of * is SL');
 assert.equal(found.items[0].unit,unit,input);
 assert.equal(found.items[0].review,false,input+' no invented ambiguity');
}
for(const chatter of ['Giá mì 316*5 thùng','Cộng 316*5 thùng','316 *5 thùng']){
 assert.equal(stock.analyze(chatter)?.kind,undefined,chatter+' not an order');
}
const daily=stock.summarizeDay([
 {sender:'remote',id:'1',text:'Mi miket - 316 *5 thùng'},
 {sender:'remote',id:'2',text:'Mi miket - 316 *5 thùng'},
 {sender:'self',id:'3',text:'Milo *5'},
 {sender:'remote',id:'4',text:'Giá mì 316*5 thùng'}
]);
assert.equal(daily.items.length,2,'do not merge repeated text or include admin');
assert.deepEqual(daily.items.map(x=>[x.name,x.qty]),[
 ['Mi miket - 316',5],['Mi miket - 316',5]
]);
assert(client.includes("const FUNCTION='v21-chat-stock-image';"));
assert(client.includes("action:'chat_stock_image'"));
assert(client.includes("if(owner()?.key!==who.key)"));
assert(client.includes("MAX_BYTES=4000000"));
assert(edge.includes('if(action!=="chat_stock_image")'));
assert(edge.includes('if(!await requireAdmin(req))'));
assert(edge.includes('readStockImageWithGemini'));
assert(edge.includes('"GEMINI_API_KEY"'));
assert(edge.includes('features:["chat_stock_image"]'));
assert(edge.includes('ready:Boolean(Deno.env.get("GEMINI_API_KEY"))'));
assert(edge.includes('mime==="image/jpeg"&&jpeg'));
assert(edge.includes('mime==="image/png"&&png'));
assert(!/db\.from\([^)]*\)\.(?:insert|update|upsert|delete)\(/u.test(edge));
assert(!/\.storage\.from\(|\.upload\(|\.remove\(|\.send\(|queueMediaFiles/u.test(edge));
assert(pure.includes('parseStockImageModel'));
assert(pure.includes('Numbers before * or × can be prices or sizes'));
assert(pure.includes('mỗi\\s+màu'));
// Future source-compatible releases may bump the app version and PWA cache.
const release=html.match(/name="app-release-version" content="(V21\.72\.\d+)"/u)?.[1];
assert(release&&Number(release.split('.').at(-1))>=69,'release >= V21.72.69');
assert(sw.includes("RELEASE_VERSION='"+release+"'"),'SW/HTML version parity');
const epoch=sw.match(/SHELL_CACHE_EPOCH='pwa-chat-ui(\d+)-[^']+'/u);
assert(epoch&&Number(epoch[1])>=425,'PWA shell epoch >= CHAT-425');
console.log('CHAT-425 text *quantity and isolated stock photo OCR guard: PASS');
