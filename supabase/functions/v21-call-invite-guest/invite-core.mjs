export async function hashInviteKey(rawKey){
  const bytes=new TextEncoder().encode(String(rawKey??''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
}

export function publicInviteState(row,nowMs=Date.now()){
  if(row?.ended_at)return 'ended';
  if(row?.revoked_at)return 'revoked';
  const expiresAt=Date.parse(String(row?.expires_at??''));
  if(!Number.isFinite(expiresAt)||expiresAt<=Number(nowMs))return 'expired';
  return 'active';
}
