// NCC-011: main-only, one-owner, fail-closed release of the exact NCC-010 schema.
// This is the ONLY NCC migration file this workflow may apply. No db push,
// no scan of pending migrations, no customer data or price writes.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const PROJECT_REF='vtqhbhrkdxirqeqkgylo';
export const TABLES=Object.freeze([
  'chat_ncc_product_aliases',
  'chat_ncc_product_vietnamese_names',
  'chat_ncc_product_purchase_evidence'
]);
const MIGRATION=new URL('../supabase/migrations/20261115010000_ncc010_product_aliases_vietnamese_names.sql',import.meta.url);
const CHECK_SQL=`select c.relname as table_name,c.relrowsecurity as rls_enabled,
has_table_privilege('anon',c.oid,'SELECT') as anon_read,
has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_read,
has_table_privilege('service_role',c.oid,'SELECT') as service_read,
has_table_privilege('service_role',c.oid,'INSERT') as service_insert,
has_table_privilege('service_role',c.oid,'UPDATE') as service_update
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
and c.relname in ('chat_ncc_product_aliases',
 'chat_ncc_product_vietnamese_names','chat_ncc_product_purchase_evidence')
order by c.relname`;

export function requireCanonicalMain(env){
 if(env.GITHUB_REPOSITORY!=='1sl2tp/chat'||
    env.GITHUB_REF!=='refs/heads/main'||
    env.PROJECT_REF!==PROJECT_REF||!env.GITHUB_SHA)
  throw Error('NCC release requires canonical 1sl2tp/chat main and project ref');
 if(!env.SUPABASE_ACCESS_TOKEN)
  throw Error('Missing CI credential SUPABASE_ACCESS_TOKEN; no manual fallback');
}
export function migrationSource(){
 const sql=readFileSync(MIGRATION,'utf8');
 for(const name of TABLES)if(!sql.includes('public.'+name))
  throw Error('Missing expected table in pinned NCC-010 migration');
 // Prevent a future edit from widening the scope of this exact release step.
 const uncommented=sql.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');
 if(/\b(?:drop|truncate|delete|update)\s+(?:table\s+|from\s+)?public\./i.test(uncommented)||
    /\b(?:create|alter)\s+(?:table|view)\s+(?!if\s+not\s+exists\s+)?public\.taphoa_/i.test(uncommented)||
    /\b(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.taphoa_/i.test(uncommented))
   throw Error('NCC release may not change canonical TAPHOA product data');
 return sql;
}
export function inspectTables(rows){
 if(!Array.isArray(rows))throw Error('Invalid NCC schema check response');
 const expected=new Set(TABLES);
 const names=new Set();
 for(const row of rows){
  if(!expected.has(row.table_name)||names.has(row.table_name))
   throw Error('Unexpected or duplicate NCC schema table');
  names.add(row.table_name);
  if(row.rls_enabled!==true||row.anon_read!==false||
     row.authenticated_read!==false||
     row.service_read!==true||row.service_insert!==true||
     row.service_update!==true)
   throw Error('NCC schema security or service-role permissions are not correct');
 }
 if(names.size===0)return 'absent';
 if(names.size!==TABLES.length)throw Error('Partially deployed NCC schema; manual audit required');
 return 'ready';
}
export async function release({env=process.env,fetchImpl=fetch}={}){
 requireCanonicalMain(env);
 const sql=migrationSource();
 const endpoint='https://api.supabase.com/v1/projects/'+PROJECT_REF+'/database/query';
 async function query(source,readOnly=false){
  const response=await fetchImpl(endpoint,{
   method:'POST',
   headers:{authorization:'Bearer '+env.SUPABASE_ACCESS_TOKEN,'content-type':'application/json'},
   body:JSON.stringify({query:source,...(readOnly?{read_only:true}:{})})
  });
  if(!response.ok)throw Error('Supabase NCC schema API returned HTTP '+response.status);
  const data=await response.json();
  if(!Array.isArray(data))throw Error('Unexpected NCC schema API response');
  return data;
 }
 const state=inspectTables(await query(CHECK_SQL,true));
 if(state==='ready'){
  console.log('NCC-010 tables already verified; no migration applied');
  return 'already_ready';
 }
 // The migration's DDL runs as one SQL transaction. A failure rolls it back.
 await query('BEGIN;\n'+sql+'\nCOMMIT;');
 const after=inspectTables(await query(CHECK_SQL,true));
 if(after!=='ready')throw Error('NCC schema post-deployment verification failed');
 console.log('NCC-010 isolated schema applied and verified; no TAPHOA prices touched');
 return 'applied_verified';
}

if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 release().catch(error=>{
  console.error('NCC schema release blocked: '+String(error?.message||error));
  process.exitCode=1;
 });
}
