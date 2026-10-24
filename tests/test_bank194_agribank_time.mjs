import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync(new URL('../bank-report-dashboard.js',import.meta.url),'utf8');
const first=js.indexOf('function agribankDisplayTime(');
const last=js.indexOf('const localTime=x=>',first);
assert(first>=0&&last>first,'Agribank date formatter missing');
const {agribankDisplayTime}=vm.runInNewContext(js.slice(first,last)+';({agribankDisplayTime})');
assert.equal(agribankDisplayTime('2026-10-23 20:58:00'),'20:58 23/10/2026');
assert.equal(agribankDisplayTime('2026-10-23T20:58:00'),'20:58 23/10/2026');
assert.equal(agribankDisplayTime('20:58 23/10/2026'),'20:58 23/10/2026');
assert.equal(agribankDisplayTime('19:57','2026-10-21'),'19:57 21/10/2026');
assert.equal(agribankDisplayTime('invalid'),'—');
assert(js.includes("note.value='Thu chuyển khoản Agribank · '+agribankDisplayTime(bank.bank_time,ui.date.value)"));
assert(js.includes("cell('Giờ Agribank',row.bank_time?agribankDisplayTime(row.bank_time,ui.date.value)"));
assert(!js.includes("note.value='Thu chuyển khoản Agribank ngày '+ui.date.value+' lúc '"));
console.log('BANK-194 Agribank HH:mm DD/MM/YYYY and no repeated ISO date PASS');
