'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('admin-composer-actions.js','utf8');
const start=src.indexOf('function buildAllManualAdvisory(previews){');
const end=src.indexOf('\nfunction closeManualAdvisory(',start);
assert(start>0&&end>start,'UI-360 helper source exists');
const ctx=vm.createContext({});
vm.runInContext(src.slice(start,end)+'\nglobalThis.combine=buildAllManualAdvisory;',ctx);
const kinds=['milk','hang-thuong','hang-u'];
const rows=kinds.map((kind,i)=>({
  ok:true,preview:true,kind,
  body:'TƯ VẤN\n\nEm chào anh/chị!\n' +
    Array.from({length:8},(_,n)=>'- Ten san pham nhom '+(i+1)+' so '+(n+1)+' abc').join('\n')+
    '\n📦 Danh mục để tham khảo'
}));
const out=ctx.combine(rows);
assert(out.length<=1400,'stay within existing advisory preview size');
assert(out.includes('📋 TƯ VẤN TẤT CẢ NHÓM HÀNG'));
assert(out.includes('🥛 SỮA')&&out.includes('🛒 HÀNG THƯỜNG')&&out.includes('🧺 HÀNG U'));
assert.equal((out.match(/^- /gm)||[]).length,15,'five sample products per three groups');
assert(out.indexOf('🥛 SỮA')<out.indexOf('🛒 HÀNG THƯỜNG'));
assert(out.indexOf('🛒 HÀNG THƯỜNG')<out.indexOf('🧺 HÀNG U'));
assert.throws(()=>ctx.combine(rows.slice(0,2)),/advisory_all_incomplete/);
assert.throws(()=>ctx.combine([{...rows[0],kind:'hang-u'},...rows.slice(1)]),/advisory_all_preview_mismatch/);
assert.throws(()=>ctx.combine([{...rows[0],body:'No items'},...rows.slice(1)]),/advisory_all_group_empty/);
const huge=kinds.map(kind=>({ok:true,preview:true,kind,body:Array.from({length:5},(_,n)=>'- '+String(n).repeat(360)).join('\n')}));
const reduced=ctx.combine(huge);
assert(reduced.length<=1400);
assert.equal((reduced.match(/^- /gm)||[]).length,3,'preserve at least one item per group');
const oversized=kinds.map(kind=>({ok:true,preview:true,kind,
  body:'- '+('Tên dài '.repeat(150))}));
assert.throws(()=>ctx.combine(oversized),/advisory_all_too_long/);
assert(src.includes("action:'advice-all',label:'🧾 Tư vấn tất cả'"));
assert(src.includes("'advice-all':'all'"));
assert(src.includes("if(kind==='all'){"));
assert(src.includes("p_send:false"),'all: only read-only server previews');
assert(src.includes("await sendAdminText(approvedAllBody,contactId,'manual-all-advice',commandId)"),
  'one manually confirmed canonical Chat send with stable client id');
assert(src.includes('if(!isManualAdvisoryGroup()||String(activeContactId())!==String(contactId))'));
assert(src.includes("const advisory=admin&&contact&&isManualAdvisoryGroup();"));
assert(!src.includes("chat_admin_manual_advisory_all"),'no new RPC');
assert(!src.includes('cron.schedule'),'no scheduler');
console.log('UI-360 all advice groups / one confirmed Chat→Zalo send / no auto scheduler PASS');
