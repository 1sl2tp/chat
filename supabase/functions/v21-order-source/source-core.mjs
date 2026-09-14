export function clean(value,max=6000){
  return String(value??'').replace(/\r\n?/g,'\n').trim().slice(0,max);
}

export function normalizeState(value){
  const state=String(value||'').trim().toLowerCase();
  if(!['pending','working','ignored','imported'].includes(state))throw new Error('invalid_source_state');
  return state;
}
