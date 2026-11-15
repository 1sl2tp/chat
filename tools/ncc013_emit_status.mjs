// NCC-013: post commit status for the canonical NCC AI release without
// exposing secrets, changing user data or triggering another deployment.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const OWNER_REPO='1sl2tp/chat';
const CONTEXT='ncc-ai-prod-release';
export function prepareStatus(mode,env){
 if(env.GITHUB_REPOSITORY!==OWNER_REPO||env.GITHUB_REF!=='refs/heads/main'||
   !/^[0-9a-f]{40}$/.test(String(env.GITHUB_SHA||'')))
  throw Error('NCC status must belong to canonical Chat main commit');
 if(!env.GITHUB_STATUS_TOKEN)throw Error('NCC status API credential not available');
 let state,description;
 if(mode==='pending'){
  state='pending';description='NCC schema and Edge production release in progress';
 }else if(mode==='final'){
  const outcome=String(env.NCC_JOB_STATUS||'failure').toLowerCase();
  if(outcome==='success'){
   state='success';description='NCC-010 schema verified and NCC AI Edge deployed';
  }else if(outcome==='cancelled'){
   state='error';description='NCC production release cancelled';
  }else{
   state='failure';
   description=env.NCC_RELEASE_REASON==='missing_ci_secret'?
    'Missing GitHub Actions SUPABASE_ACCESS_TOKEN; production unchanged':
    'NCC production release failed; see Deploy NCC AI Chat Edge logs';
  }
 }else throw Error('Invalid release status mode');
 const runId=String(env.GITHUB_RUN_ID||'');
 const runUrl=/^[1-9][0-9]{4,19}$/.test(runId)?
  'https://github.com/'+OWNER_REPO+'/actions/runs/'+runId:
  'https://github.com/'+OWNER_REPO+'/actions/workflows/deploy-ncc-ai-room-edge.yml';
 return {state,context:CONTEXT,description,target_url:runUrl};
}
export async function emitStatus(mode,{env=process.env,fetchImpl=fetch}={}){
 const payload=prepareStatus(mode,env);
 const uri='https://api.github.com/repos/'+OWNER_REPO+'/statuses/'+env.GITHUB_SHA;
 const response=await fetchImpl(uri,{
  method:'POST',
  headers:{
   authorization:'Bearer '+env.GITHUB_STATUS_TOKEN,
   accept:'application/vnd.github+json',
   'x-github-api-version':'2022-11-28',
   'content-type':'application/json'
  },
  body:JSON.stringify(payload)
 });
 if(!response.ok)throw Error('Unable to post NCC release commit status: HTTP '+response.status);
 console.log('NCC production release status: '+payload.state+' ('+payload.context+')');
 return payload;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 emitStatus(process.argv[2]).catch(error=>{
  console.error(String(error?.message||error));process.exitCode=1;
 });
}
