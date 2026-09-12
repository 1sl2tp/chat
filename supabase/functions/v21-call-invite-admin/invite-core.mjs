export const INVITE_TTL_MS=10*60*1000;

function bytesToBase64Url(bytes){
  let binary='';
  for(const value of bytes)binary+=String.fromCharCode(value);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}

export function makeInviteKey(bytes=24){
  const size=Math.max(24,Number(bytes)||24);
  const buffer=new Uint8Array(size);
  crypto.getRandomValues(buffer);
  return bytesToBase64Url(buffer);
}

export async function hashInviteKey(rawKey){
  const bytes=new TextEncoder().encode(String(rawKey??''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
}

export function makeRoomName(inviteId){
  const compact=String(inviteId??'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!compact)throw new Error('invite_id_required');
  return `taphoa-guest-${compact}`;
}

export function inviteState(row,nowMs=Date.now()){
  if(row?.ended_at)return 'ended';
  if(row?.revoked_at)return 'revoked';
  const expiresAt=Date.parse(String(row?.expires_at??''));
  if(!Number.isFinite(expiresAt)||expiresAt<=Number(nowMs))return 'expired';
  return 'active';
}
