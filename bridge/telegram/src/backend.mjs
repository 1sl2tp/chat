import {normalizedPilotContacts} from './core.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseAllowlist(value){
  const ids=String(value||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!ids.length||ids.length>3||new Set(ids).size!==ids.length||!ids.every(id=>UUID.test(id))){
    throw new Error('telegram_pilot_allowlist_requires_1_to_3_unique_account_uuids');
  }
  return ids;
}
export async function readPilotDirectory({baseUrl,serviceRoleKey,accountIds,fetchImpl=fetch}={}){
  const base=String(baseUrl||'').replace(/\/+$/,''),key=String(serviceRoleKey||'');
  if(!/^https:\/\//.test(base)||!key)throw new Error('telegram_backend_credentials_missing');
  const ids=Array.isArray(accountIds)?parseAllowlist(accountIds.join(',')):parseAllowlist(accountIds);
  async function read(table,fields,field,value){
    const url=new URL(base+'/rest/v1/'+table);
    url.searchParams.set('select',fields);
    url.searchParams.set(field,'eq.'+value);
    url.searchParams.set('limit','1');
    const response=await fetchImpl(url.toString(),{
      headers:{apikey:key,authorization:'Bearer '+key,accept:'application/json'},
      signal:AbortSignal.timeout(15000),
    });
    if(!response.ok)throw new Error('telegram_backend_read_failed_'+table+'_'+response.status);
    const data=await response.json();
    return Array.isArray(data)?data[0]||null:null;
  }
  const rows=[];
  for(const accountId of ids){
    const account=await read('v21_accounts','id,display_name,role,deleted_at','id',accountId);
    if(!account||account.role!=='user'||account.deleted_at)throw new Error('telegram_backend_account_not_active_user');
    const link=await read('zalo_user_links','chat_account_id,zalo_id','chat_account_id',accountId);
    const zalo=link?.zalo_id
      ?await read('zalo_contacts','zalo_id,display_name,profile_name,alias_name,thread_type','zalo_id',link.zalo_id)
      :null;
    if(zalo&&zalo.thread_type==='group')throw new Error('telegram_pilot_group_contact_not_supported');
    rows.push({accountId,name:zalo?.alias_name||account.display_name||zalo?.display_name||'',
      zaloId:link?.zalo_id||null});
  }
  const contacts=normalizedPilotContacts(rows);
  if(contacts.length!==ids.length)throw new Error('telegram_backend_directory_incomplete');
  return contacts;
}
