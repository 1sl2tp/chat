'use strict';
// BANK-362: pure offline regression — never sends a real message or books money.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/v21-bank-bill-event/index.ts'), 'utf8');
const start = source.indexOf('// BANK-362:');
const end = source.indexOf('const HEX=', start);
assert(start >= 0 && end > start, 'immediate ACK helper must be present');

const fnSource = source.slice(start, end)
  .replace('posted:any', 'posted')
  .replace('):Promise<void>{', '){');

function helper(rpc, warnings = []) {
  const db = { rpc };
  const logger = { warn: (...args) => warnings.push(args.join(' ')) };
  return new Function('db', 'console', fnSource + '\nreturn acknowledgePostedCollection;')(db, logger);
}

async function run() {
  assert.equal((source.match(/await acknowledgePostedCollection\(/g) || []).length, 4,
    'all four successful OCR/recheck/recovery collections must immediately acknowledge');
  const direct = [...source.matchAll(/if\(!postError&&posted\?\.ok===true&&posted\?\.status==="received"\)\s*\{\s*await acknowledgePostedCollection\(posted\)/g)];
  assert.equal(direct.length, 2, 'both direct collection returns require ACK');
  assert.match(source,
    /if\(recovery\.posted\)await acknowledgePostedCollection\(recovery\.posted\)/,
    'bank-backed stored no-clock recovery may ACK only after financial RPC success');
  assert.match(source, /if\(receiptPosted\)\s*\{\s*await acknowledgePostedCollection\(receiptPosted\)/);

  const calls = [];
  const send = helper(async (name, args) => {
    calls.push({ name, args });
    return { data: { ok: true, checked: 1, sent: 1 }, error: null };
  });
  await send({ok:true,status:'received',ledger_id:945});
  assert.deepEqual(calls, [{name:'chat_bank_auto_collection_ack_drain',args:{p_limit:30}}]);
  assert.equal(calls.length, 1, 'no duplicate ACK drain invocation');

  for (const bad of [null, {}, {ok:false,status:'received',ledger_id:1},
    {ok:true,status:'amount_read',ledger_id:1},
    {ok:true,status:'received',ledger_id:null},
    {ok:true,status:'received',ledger_id:0},
    {ok:true,status:'received',ledger_id:'bad'}]) await send(bad);
  assert.equal(calls.length, 1, 'no ACK before financial success');

  let warningCount = 0;
  const warnings = [];
  await helper(async () => ({data:null,error:{code:'NETWORK'}}),warnings)({ok:true,status:'received',ledger_id:1});
  await helper(async () => {throw Error('offline');},warnings)({ok:true,status:'received',ledger_id:1});
  await helper(async () => ({data:{ok:true,busy:true},error:null}),warnings)({ok:true,status:'received',ledger_id:1});
  warningCount=warnings.length;
  assert.equal(warningCount,3,'failures and advisory lock contention must be logged without throwing');
  assert(warnings.every(x => x === 'bank362_collection_ack_deferred'), 'do not log amounts or bank/customer details');

  assert(!fnSource.includes('taphoa_debt_ledger'), 'ACK helper must never mutate money');
  console.log('BANK-362: verified immediate ACK / fail-closed / retry fallback — PASS');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
