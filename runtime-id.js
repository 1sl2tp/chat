(()=>{
'use strict';
const VERSION='V21.71';

function createRuntimeId(){
  const cryptoApi=globalThis.crypto||null;
  try{
    if(typeof cryptoApi?.randomUUID==='function'){
      const value=cryptoApi.randomUUID();
      if(value)return String(value);
    }
  }catch(_error){}

  try{
    if(typeof cryptoApi?.getRandomValues==='function'){
      const bytes=new Uint8Array(16);
      cryptoApi.getRandomValues(bytes);
      bytes[6]=(bytes[6]&0x0f)|0x40;
      bytes[8]=(bytes[8]&0x3f)|0x80;
      const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }
  }catch(_error){}

  // Last-resort compatibility path for restricted/legacy webviews. Keep the
  // UUID v4 shape because device-key validation persists only UUID-shaped ids.
  // This is not a security token; it is only an app-local identity/idempotency
  // key when the browser exposes no usable cryptographic random source.
  const bytes=new Uint8Array(16);
  for(let index=0;index<bytes.length;index++)bytes[index]=Math.floor(Math.random()*256);
  bytes[6]=(bytes[6]&0x0f)|0x40;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

window.V21RuntimeId=Object.freeze({version:VERSION,create:createRuntimeId});
})();
