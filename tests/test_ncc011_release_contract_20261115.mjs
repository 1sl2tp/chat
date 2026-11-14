// NCC-011: fully mocked release tests; NEVER contacts Supabase or production.
import assert from 'node:assert/strict';
import {PROJECT_REF,TABLES,requireCanonicalMain,migrationSource,inspectTables,release} from '../tools/release_ncc010_product_identity.mjs';
const env={GITHUB_REPOSITORY:'1sl2tp/chat',GITHUB_REF:'refs/heads/main',
 GITHUB_SHA:'test-commit',PROJECT_REF,SUPABASE_ACCESS_TOKEN:'fake-test-only'};
const table=name=>({table_name:name,rls_enabled:true,anon_read:false,
 authenticated_read:false,service_read:true,service_insert:true,service_update:true});
const ready=TABLES.map(table).sort((a,b)=>a.table_name.localeCompare(b.table_name));
assert.equal(inspectTables(ready),'ready');
assert.equal(inspectTables([]),'absent');
assert.throws(()=>inspectTables([table(TABLES[0])]),/Partially deployed/);
assert.throws(()=>inspectTables(ready.map((x,i)=>i===0?{...x,anon_read:true}:x)),/security/);
assert.throws(()=>inspectTables(ready.map((x,i)=>i===0?{...x,rls_enabled:false}:x)),/security/);
assert.throws(()=>requireCanonicalMain({...env,GITHUB_REF:'refs/heads/feature'}),/canonical/);
assert.throws(()=>requireCanonicalMain({...env,PROJECT_REF:'wrong-project'}),/canonical/);
assert.throws(()=>requireCanonicalMain({...env,SUPABASE_ACCESS_TOKEN:''}),/credential/);
const sql=migrationSource();
for(const name of TABLES)assert(sql.includes('public.'+name));
assert(!/UPDATE\s+public\.taphoa_products\s+SET/i.test(sql));
const recorded=[];
const mock=answers=>async(url,options)=>{
 const payload=JSON.parse(options.body);
 recorded.push({url,method:options.method,sql:payload.query,readonly:payload.read_only===true,
  hasAuthorization:options.headers.authorization==='Bearer fake-test-only'});
 assert.equal(url,'https://api.supabase.com/v1/projects/'+PROJECT_REF+'/database/query');
 assert.equal(options.method,'POST');
 assert.equal(options.headers.authorization,'Bearer fake-test-only');
 const next=answers.shift();
 if(!next)throw Error('Unexpected extra production call');
 return {ok:true,status:201,json:async()=>next};
};
let result=await release({env,fetchImpl:mock([ready])});
assert.equal(result,'already_ready');
assert.equal(recorded.length,1,'already migrated = read-only check only');
assert.equal(recorded[0].readonly,true);
recorded.length=0;
result=await release({env,fetchImpl:mock([[],[],ready])});
assert.equal(result,'applied_verified');
assert.equal(recorded.length,3,'one read, one exact SQL migration, one verification');
assert.equal(recorded[1].readonly,false);
assert(recorded[1].sql.startsWith('BEGIN;\n'));
assert(recorded[1].sql.includes('CREATE TABLE IF NOT EXISTS public.chat_ncc_product_aliases'));
assert(recorded[1].sql.endsWith('\nCOMMIT;'));
assert.equal(recorded[2].readonly,true);
recorded.length=0;
await assert.rejects(release({env,fetchImpl:mock([[ready[0]]])}),/Partially deployed/);
assert.equal(recorded.length,1,'partial schema stops before write');
recorded.length=0;
await assert.rejects(release({env:{...env,SUPABASE_ACCESS_TOKEN:''},fetchImpl:mock([])}),/credential/);
assert.equal(recorded.length,0,'no credential = no HTTP calls');
const fs=await import('node:fs');
const workflow=fs.readFileSync('.github/workflows/deploy-ncc-ai-room-edge.yml','utf8');
assert(workflow.includes('node tools/release_ncc010_product_identity.mjs'));
assert(workflow.includes('supabase functions deploy v21-ncc-ai-room'));
assert(!workflow.includes('supabase db push'));
assert(!workflow.includes('v21-bank-bill-event'));
console.log('NCC-011: main-only schema contract, RLS, one-owner release and no-credential fail closed PASS');
