// NCC-013: no network access; test mocked commit-status writer only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareStatus,emitStatus} from '../tools/ncc013_emit_status.mjs';
const base={
 GITHUB_REPOSITORY:'1sl2tp/chat',
 GITHUB_REF:'refs/heads/main',
 GITHUB_SHA:'a'.repeat(40),
 GITHUB_STATUS_TOKEN:'fake-test-token'
};
assert.equal(prepareStatus('pending',base).state,'pending');
assert.equal(prepareStatus('final',{...base,NCC_JOB_STATUS:'success'}).state,'success');
assert.equal(prepareStatus('final',{...base,NCC_JOB_STATUS:'failure'}).state,'failure');
assert.match(prepareStatus('final',{...base,NCC_JOB_STATUS:'failure',NCC_RELEASE_REASON:'missing_ci_secret'}).description,/SUPABASE_ACCESS_TOKEN/);
assert.equal(prepareStatus('final',{...base,NCC_JOB_STATUS:'cancelled'}).state,'error');
assert.throws(()=>prepareStatus('pending',{...base,GITHUB_REF:'refs/heads/dev'}),/canonical/);
assert.throws(()=>prepareStatus('pending',{...base,GITHUB_REPOSITORY:'other/other'}),/canonical/);
assert.throws(()=>prepareStatus('pending',{...base,GITHUB_STATUS_TOKEN:''}),/credential/);
assert.throws(()=>prepareStatus('pending',{...base,GITHUB_SHA:'invalid'}),/canonical/);
assert.throws(()=>prepareStatus('unexpected',base),/mode/);
const calls=[];
const mock=async (url,options)=>{
 calls.push({url,options});
 return {ok:true,status:201};
};
const status=await emitStatus('final',{env:{...base,NCC_JOB_STATUS:'failure',NCC_RELEASE_REASON:'missing_ci_secret'},fetchImpl:mock});
assert.equal(status.state,'failure');
assert.equal(calls.length,1);
assert.equal(calls[0].url,'https://api.github.com/repos/1sl2tp/chat/statuses/'+base.GITHUB_SHA);
assert.equal(calls[0].options.headers.authorization,'Bearer fake-test-token');
assert.equal(JSON.parse(calls[0].options.body).context,'ncc-ai-prod-release');
assert(!calls[0].options.body.includes('fake-test-token'),'secret not in visible status payload');
const workflow=fs.readFileSync('.github/workflows/deploy-ncc-ai-room-edge.yml','utf8');
for (const marker of ['statuses: write','node tools/ncc013_emit_status.mjs pending','node tools/ncc013_emit_status.mjs final','if: always()','NCC_RELEASE_REASON=missing_ci_secret'])
 assert(workflow.includes(marker),'missing workflow status contract '+marker);
assert(workflow.indexOf('node tools/ncc013_emit_status.mjs pending')<
 workflow.indexOf('Release only the pinned NCC-010 schema'));
assert(!workflow.includes('supabase db push'));
console.log('NCC-013 release commit status, missing-token diagnosis and safe GitHub reporting PASS');
