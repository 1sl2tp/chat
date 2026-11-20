// CHAT-418: explicit Admin-selected supplier chat sources for existing NCC AI.
// Names below are seed matches only; the durable choices are contact IDs.
// Scoped device preference, no new DB tables, no customer chat sends.
(()=>{'use strict';
const DEFAULT_NAMES=new Set(['e anh dat','ethuonghangu','e thuonghangu','a thuonghangu','pp thuoc la']);
const fallback=new Map();
const norm=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
 .replace(/đ/giu,'d').toLocaleLowerCase('vi').replace(/\s+/gu,' ').trim();
function admin(){
 const s=window.V21AuthSessionStore?.snapshot?.()||{};
 return s.state==='AUTHENTICATED'&&s.account?.role==='admin'&&s.account?.id?
  String(s.account.id):'';
}
function storageKey(){const id=admin();return id?'chat-ncc-source-ids:'+id:'';}
function contactList(){
 if(!admin())return [];
 const list=window.V21ContactStore?.snapshot?.();
 return Array.isArray(list)?list.filter(x=>x&&x.id&&!x.deleted_at):[];
}
function groupFor(id){return window.V21ContactDirectoryAdmin?.groupForContact?.(String(id||''))||null;}
function candidates(){
 return contactList().filter(x=>{
  const group=groupFor(x.id);
  // Group mapping is the authority. Unknown/unloaded and KH fail closed.
  return group!==null&&group!=='customer';
 });
}
function names(item){return [item?.display_name,item?.username].map(norm).filter(Boolean);}
const TYPES=Object.freeze({
 general:'Hàng thường',u:'Hàng U',tobacco:'Thuốc lá',other:'Hàng khác'
});
function typeStorageKey(){const id=admin();return id?'chat-ncc-source-types:'+id:'';}
function defaultType(item){
 const ns=names(item);
 if(ns.some(x=>x==='e anh dat'))return 'general';
 if(ns.some(x=>x==='ethuonghangu'||x==='e thuonghangu'||x==='a thuonghangu'))return 'u';
 if(ns.some(x=>x==='pp thuoc la'))return 'tobacco';
 return 'other';
}
function typeFor(contactId){
 const id=String(contactId||''),contact=candidates().find(x=>String(x.id)===id);
 if(!contact)return null;
 try{
  const data=JSON.parse(window.localStorage?.getItem(typeStorageKey())||'{}');
  if(data&&Object.prototype.hasOwnProperty.call(TYPES,data[id]))return data[id];
 }catch{}
 return defaultType(contact);
}
function setType(contactId,type){
 const id=String(contactId||'');
 if(!selected(id)||!Object.prototype.hasOwnProperty.call(TYPES,String(type)))return false;
 const key=typeStorageKey();if(!key)return false;
 let data={};
 try{data=JSON.parse(window.localStorage?.getItem(key)||'{}')||{};}catch{}
 if(typeof data!=='object'||Array.isArray(data))data={};
 data[id]=String(type);
 try{window.localStorage?.setItem(key,JSON.stringify(data));}catch{return false;}
 document.dispatchEvent(new Event('v21-ncc-sources-changed'));
 return true;
}
function defaults(choices=candidates()){
 const selected=[];
 for(const name of DEFAULT_NAMES){
  const matches=choices.filter(x=>names(x).includes(name));
  if(matches.length===1&&!selected.includes(String(matches[0].id)))
   selected.push(String(matches[0].id));
 }
 return selected;
}
function readSaved(){
 const key=storageKey();if(!key)return null;
 try{
  const raw=window.localStorage?.getItem(key);
  if(raw===null||raw===undefined)return fallback.get(key)||null;
  const parsed=JSON.parse(raw);
  return Array.isArray(parsed)?parsed.filter(x=>typeof x==='string').slice(0,300):null;
 }catch{return fallback.get(key)||null;}
}
function chosen(){
 const saved=readSaved();
 return new Set(saved===null?defaults():saved);
}
function selected(contactId){
 const id=String(contactId||'');
 return Boolean(id&&candidates().some(x=>String(x.id)===id)&&chosen().has(id));
}
function list(){
 const chosenIds=chosen();
 return candidates().map(item=>({
  id:String(item.id),
  name:String(item.display_name||item.username||'Liên hệ').slice(0,100),
  selected:chosenIds.has(String(item.id)),
  group:groupFor(item.id),type:typeFor(item.id),typeLabel:TYPES[typeFor(item.id)]||TYPES.other
 }));
}
function setSelected(contactId,enabled){
 const id=String(contactId||'');
 const key=storageKey();
 if(!key||!candidates().some(x=>String(x.id)===id))return false;
 const ids=chosen();
 if(enabled)ids.add(id);else ids.delete(id);
 const data=[...ids].slice(0,300);
 fallback.set(key,data);
 try{window.localStorage?.setItem(key,JSON.stringify(data));}catch{}
 document.dispatchEvent(new Event('v21-ncc-sources-changed'));
 return true;
}
function clear(){
 // No private photo/text is stored; keep other admins' selections separate.
 document.dispatchEvent(new Event('v21-ncc-sources-changed'));
}
document.addEventListener('v21-auth-state',clear);
window.V21NccSources=Object.freeze({list,selected,setSelected,defaults,groupFor,typeFor,setType,types:TYPES});
})();
