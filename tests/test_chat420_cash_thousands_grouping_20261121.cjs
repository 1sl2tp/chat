'use strict';
// CHAT-420: input display is grouped, RPC conversion remains exact, no live charges.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('admin-composer-actions.js','utf8');
const start=src.indexOf('function cashThousandsToVnd(');
const end=src.indexOf('async function openQuickCash(',start);
assert(start>0&&end>start,'helpers must remain in cash owner');
const h=vm.runInNewContext(src.slice(start,end)+
 '\n({cashThousandsToVnd,cashDisplayThousandsToVnd,cashGroupedInput,cashPaintGroupedInput,cashDeleteGroupingNeighbor,cashCaretAfterDigits,cashFormatThousands});',
 {Number,String,Intl});
for(const [raw,expected] of [
 ['1','1'],['11','11'],['113','113'],['1137','1.137'],
 ['11378','11.378'],['113780','113.780'],
 ['1137800','1.137.800'],['123456789','123.456.789'],
 ['',''],['0011378','0.011.378']
])assert.equal(h.cashGroupedInput(raw),expected,raw);
for(const [raw,expected] of [
 ['11.378',11378000],['11378',11378000],
 ['1.137.800',1137800000],['123.456.789',123456789000],
 ['500.000',500000000],['0',null],['0.000',null],['',null],
 ['11,378',null],['11.37',null],['1.1',null],
 ['11..378',null],['11.378đ',null],['11 378',null],
 ['1.23.456',null],['1.000.000.000',null],
 ['999.999.999',999999999000]
])assert.equal(h.cashDisplayThousandsToVnd(raw),expected,'parsed '+raw);
assert.equal(h.cashThousandsToVnd('500.000'),null,
 'original RPC digits-only parser must remain strictly isolated');
assert.equal(h.cashThousandsToVnd('11378'),11378000);
assert.equal(h.cashGroupedInput('11.38'),null,
 'malformed pasted separator must not be silently interpreted as 1138');
assert.equal(h.cashGroupedInput('11.38',true),'1.138',
 'backspacing within a valid grouped number should recover digits');
assert.equal(h.cashGroupedInput('11.38đ',true),null,'reject non numeric typing');
assert.equal(h.cashFormatThousands(11378000),'11.378');
function field(value,start=value.length,end=start){
 return {
  value,selectionStart:start,selectionEnd:end,
  setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}
 };
}
const entered=field('11378');
assert.equal(h.cashPaintGroupedInput(entered,true),true);
assert.equal(entered.value,'11.378');
assert.equal(entered.selectionStart,6,'caret remains at end');
const mid=field('11378',2);
h.cashPaintGroupedInput(mid,true);
assert.equal(mid.value,'11.378');
assert.equal(mid.selectionStart,2,'caret before separator stays stable');
const typed=field('1.1378',6);
h.cashPaintGroupedInput(typed,true);
assert.equal(typed.value,'11.378');
assert.equal(typed.selectionStart,6);
const back=field('11.378',3);
assert.equal(h.cashDeleteGroupingNeighbor(back,'Backspace'),true);
assert.equal(back.value,'1.378');
assert.equal(back.selectionStart,1);
const del=field('11.378',2);
assert.equal(h.cashDeleteGroupingNeighbor(del,'Delete'),true);
assert.equal(del.value,'1.178');
assert.equal(del.selectionStart,3);
const selected=field('11.378',2,4);
assert.equal(h.cashDeleteGroupingNeighbor(selected,'Delete'),false,
 'ordinary selected-range deletion is left to native browser');
const malformedPaste=field('11,378');
assert.equal(h.cashPaintGroupedInput(malformedPaste,false),false);
assert.equal(malformedPaste.value,'11,378','invalid paste preserved, not silently changed');
const modal=src.slice(end,src.indexOf('function mountQuickActions(',end));
for(const token of [
 'data-cash-amount type="text" inputmode="numeric"',
 'pattern="[0-9]{1,3}([.][0-9]{3})*"',
 'required maxlength="11"',
 "const parseAmount=()=>cashDisplayThousandsToVnd(amount.value)",
 "cashDeleteGroupingNeighbor(amount,event.key)",
 "cashPaintGroupedInput(amount,event.inputType!=='insertFromPaste'",
 "if(amount.value!==''&&cashDisplayThousandsToVnd(amount.value)===null)",
 "p_amount_vnd:vnd","Number(data.source_amount_vnd)!==vnd",
 "if(latestDebtVnd!==debtVnd)",
 "check.checked=false",
])assert(modal.includes(token),'missing safety contract '+token);
assert(!modal.includes("p_amount_vnd:Number(amount.value)"),
 'never send a formatted display directly to backend');
console.log('CHAT-420 live grouping 11378 → 11.378, caret/backspace, VND exactly 11.378.000: PASS');
