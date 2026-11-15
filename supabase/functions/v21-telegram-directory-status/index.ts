// TELE-003: read-only count of canonical Chat accounts for Telegram sync readiness.
// No Telegram API, no Zalo contacts, no writes, no account identities in responses.
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff'};
function reply(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers});}
Deno.serve(async req=>{
  if(req.method!=='GET'||new URL(req.url).pathname.split('/').at(-1)!=='status'){
    return reply(404,{ok:false,error:'not_found'});
  }
  const base=Deno.env.get('SUPABASE_URL')||'';
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!/^https:\/\//.test(base)||!secret)return reply(503,{ok:false,code:'backend_unconfigured'});
  try{
    const url=new URL(base.replace(/\/+$/,'')+'/rest/v1/v21_accounts');
    url.searchParams.set('select','id,display_name');
    url.searchParams.set('role','eq.user');
    url.searchParams.set('deleted_at','is.null');
    url.searchParams.set('order','id.asc');
    url.searchParams.set('limit','200');
    const result=await fetch(url.toString(),{
      headers:{apikey:secret,authorization:'Bearer '+secret,accept:'application/json'},
      signal:AbortSignal.timeout(12000),
    });
    if(!result.ok)return reply(502,{ok:false,code:'backend_read_failed'});
    const rows=await result.json();
    if(!Array.isArray(rows)||rows.length>200)return reply(502,{ok:false,code:'backend_snapshot_invalid'});
    // Count is informational. Synchronization must derive identity from full secure read + mapping.
    return reply(200,{ok:true,mode:'read_only',
      source:'v21_accounts',activeChatAccounts:rows.length,
      displayNamesPresent:rows.every(x=>typeof x.display_name==='string'&&x.display_name.trim().length>0),
      topicsCreatedByThisFunction:0,
      importedZaloContacts:0,
      note:'No Topic creation, Telegram send, or database changes.'});
  }catch(_){return reply(502,{ok:false,code:'backend_request_failed'});}
});
