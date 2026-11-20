'use strict';
// CHAT-419: three supplier classes, 3 receipts in one day, no silent price merge.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=path=>fs.readFileSync(path,'utf8');
const aggSource=read('ncc-day-groups.js');
const sourceCode=read('chat-ncc-sources.js');
const ui=read('chat-ncc-image-ui.js');
const room=read('ncc-ai-room.js');
const html=read('index.source.html');
const app=read('app.js');
const css=read('ncc-ai-room.css');
const ctx={};ctx.window=ctx;ctx.localStorage={
 values:new Map(),
 getItem(key){return this.values.get(key)??null;},
 setItem(key,value){this.values.set(key,value);}
};
vm.runInNewContext(aggSource,ctx);
const api=ctx.V21NccDayGroups;
assert(api&&typeof api.aggregate==='function');
assert.equal(api.dayISO('19/11/2026'),'2026-11-19');
assert.equal(api.dayISO('2026-11-19T12:40:00+07:00'),'2026-11-19');
assert.equal(api.dayISO('31/11/2026'),'','invalid day must fail closed');
const record=(id,day,lines,payable,status='verified')=>({
 hash:id.repeat(64),created_at:'2026-11-21T08:00:00+07:00',
 status:'supplier_invoice',document:{date:day},lines,
 summary:{status,payable_printed_vnd:payable}
});
const line=(name,quantity,price,gross,netPrice,net,unit='thùng')=>({
 printed_name:name,printed_unit:unit,quantity,unit_price_vnd:price,
 gross_line_vnd:gross,net_unit_vnd:netPrice,net_line_vnd:net
});
const a=record('a','19/11/2026',[line('Sữa chua 1kg',5,100,500,98,490)],490);
const b=record('b','19/11/2026',[line('Sữa chua 1kg',3,100,300,98,294)],294);
const c=record('c','19/11/2026',[line('Sữa chua 1kg',2,105,210,100,200)],200);
const d=record('d','19/11/2026',[line('Sữa chua 1kg',5,100,500,98,490)],490);
const e=record('e','20/11/2026',[line('Sữa chua 1kg',1,100,100,98,98)],98);
const f=record('f','19/11/2026',[line('Bánh khác',1,90,90,90,90)],90);
const sources=[
 {id:'anh',name:'E Anh đạt',group:'ncc',type:'general',selected:true},
 {id:'thuong',name:'ethuonghangu',group:'other',type:'u',selected:true},
 {id:'pp',name:'PP Thuốc Lá',group:'ncc',type:'tobacco',selected:true},
 {id:'kh',name:'Khách KH',group:'customer',type:'other',selected:true}
];
const links={
 [a.hash]:{contactId:'anh'},[b.hash]:{contactId:'anh'},
 [c.hash]:{contactId:'anh'},[d.hash]:{contactId:'thuong'},
 [e.hash]:{contactId:'pp'},[f.hash]:{contactId:'kh'}
};
const groups=api.aggregate([a,b,c,c,d,e,f],links,sources);
assert.equal(groups.length,3,'3 source/day groups: 19 Anh, 19 U, 20 Thuốc lá');
const anh=groups.find(g=>g.contactId==='anh');
assert.equal(anh.invoices.length,3,'same photo hash is not double counted');
assert.equal(anh.rows.length,2,'same item different price is NOT merged');
assert.equal(anh.rows.find(x=>x.price===100).quantity,8);
assert.equal(anh.rows.find(x=>x.price===105).quantity,2);
assert.equal(anh.grossTotal,1010);
assert.equal(anh.netTotal,984);
assert.equal(anh.printedPayable,984);
assert.equal(anh.review,false);
assert.equal(groups.find(g=>g.contactId==='thuong').typeLabel,'Hàng U');
assert.equal(groups.find(g=>g.contactId==='pp').typeLabel,'Thuốc lá');
assert(!groups.some(g=>g.contactId==='kh'),'KH never enters supplier aggregates');
assert.equal(api.aggregate([a],{},sources).length,0,'unattributed invoices are not guessed');
const partial=record('9','19/11/2026',[line('Hàng thiếu giá',3,null,null,null,null)],null,'insufficient');
const incomplete=api.aggregate([partial],{[partial.hash]:{contactId:'anh'}},sources)[0];
assert.equal(incomplete.grossTotal,null);
assert.equal(incomplete.netTotal,null);
assert.equal(incomplete.printedPayable,null);
assert.equal(incomplete.review,true);
assert.equal(incomplete.rows[0].gross,null);
assert.equal(api.dateFor({created_at:'2026-11-20T05:12:00+07:00',document:{date:null}},
 {messageDay:'2026-11-19'}).basis,'ngày ảnh trong Chat');
assert.equal(api.dateFor({created_at:'2026-11-20T05:12:00+07:00',document:{date:null}},
 {}).basis,'ngày đọc, chưa xác minh ngày phiếu');
const empty=api.aggregate([a],{[a.hash]:{contactId:'kh'}},sources);
assert.equal(empty.length,0);
assert(api.save('admin',a.hash,{contactId:'anh',messageDay:'2026-11-19'},ctx.localStorage));
assert.equal(api.load('admin',ctx.localStorage)[a.hash].contactId,'anh');
assert.equal(Object.keys(api.load('other-admin',ctx.localStorage)).length,0);
assert(api.unlink('admin',a.hash,ctx.localStorage));
assert.equal(Object.keys(api.load('admin',ctx.localStorage)).length,0);
assert.equal(api.save('admin','bad',{contactId:'anh'},ctx.localStorage),false);
assert(!/fetch\(|functions\.invoke|supabase\.|\.insert\(|\.upsert\(/u.test(aggSource));

// Default source types from display names are exact matches, not fuzzy guesses.
let names=[
 {id:'anh',display_name:'E Anh đạt'},
 {id:'thuong',display_name:'ethuonghangu'},
 {id:'pp',display_name:'Pp Thuốc Lá'},
 {id:'kh',display_name:'Khách KH'}
];
const groupsById=new Map([['anh','ncc'],['thuong','other'],['pp','ncc'],['kh','customer']]);
const events=[];
ctx.V21AuthSessionStore={snapshot:()=>({state:'AUTHENTICATED',account:{id:'admin',role:'admin'}})};
ctx.V21ContactStore={snapshot:()=>names};
ctx.V21ContactDirectoryAdmin={groupForContact:id=>groupsById.get(id)};
ctx.document={addEventListener(){},dispatchEvent:e=>events.push(e.type)};
ctx.Event=class Event{constructor(type){this.type=type;}};
vm.runInNewContext(sourceCode,ctx);
const src=ctx.V21NccSources;
assert(src.selected('anh'));
assert(src.selected('thuong'));
assert(src.selected('pp'));
assert(!src.selected('kh'));
assert.equal(src.typeFor('anh'),'general');
assert.equal(src.typeFor('thuong'),'u');
assert.equal(src.typeFor('pp'),'tobacco');
assert.equal(src.setType('pp','general'),true);
assert.equal(src.typeFor('pp'),'general');
assert.equal(src.setType('kh','tobacco'),false);
assert.equal(src.setSelected('pp',false),true);
assert.equal(src.selected('pp'),false,'manual deselection persists');
assert.equal(src.selected('pp'),false,'one-time default migration never resubscribes it');
assert(ui.includes('messageDate'), 'photo handoff preserves original chat timestamp');
assert(room.includes('function renderDayGroups('));
assert(room.includes('invoiceRecords.set('));
assert(room.includes('function invoiceCard('));
assert(room.includes('linkStagedRecord(record,pendingSource)'));
assert(room.includes('renderDayGroups();'));
assert(room.includes('stageChatImage({assetId,contactId,messageDate}'));
const staged=room.slice(room.indexOf('async function stageChatImage'),room.indexOf('function launchButton'));
assert(!staged.includes('await submit('),'Chat image staging remains opt-in');
assert(html.includes('data-build-source="ncc-day-groups.js"'));
assert(html.indexOf('data-build-source="ncc-day-groups.js"')<html.indexOf('data-build-source="ncc-ai-room.js"'));
assert(css.includes('.ncc-day-table-scroll'));
assert(app.includes("window.V21NccChatImageUI?.sync?.(node,message)"));
console.log('CHAT-419 source-type + 3-slip daily merge + price/discount safety PASS');
