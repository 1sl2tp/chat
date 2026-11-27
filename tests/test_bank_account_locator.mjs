import assert from "node:assert/strict";
import {ACCOUNT_REGION_PROMPT,canLocateAccountRegion,locateAccountRegion,prepareLocatedAccountParts} from "../supabase/functions/v21-bank-bill-event/bill-account-locator.mjs";
const bytes=new Uint8Array([255,216,255,192,0,8,8,0,100,0,200,1,255,218]);
const region={role:"recipient_account",box:[400,150,500,850]};
let calls=0;
const reply=p=>({ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(p)}]}}]})});
const args={bytes,mime:"image/jpg",encode:b=>String(b.length),key:"fixture",fetchFn:async(url,opts)=>{calls++;const p=JSON.parse(opts.body);assert.equal(p.contents[0].parts[0].text,ACCOUNT_REGION_PROMPT);assert.equal(p.contents[0].parts[1].inlineData.mimeType,"image/jpeg");assert(!opts.body.includes("2901181999999"));return reply(region)}};
assert.equal(canLocateAccountRegion(bytes,"image/jpg",null),true);
assert.equal(canLocateAccountRegion(bytes,"image/jpeg",region),false);
assert.equal(canLocateAccountRegion(bytes,"image/webp",null),false);
assert.deepEqual(await locateAccountRegion({...args,stored:region}),region);assert.equal(calls,0);
assert.deepEqual(await locateAccountRegion(args),region);assert.equal(calls,1);
const loadCodec=async()=>({decode:()=>({width:200,height:100,data:new Uint8Array(200*100*4)}),encode:()=>({data:new Uint8Array([1,2,3])})});
const parts=await prepareLocatedAccountParts({...args,loadCodec});assert.equal(parts.length,3);assert.equal(calls,2);
for(const bad of [{role:"sender_account",box:region.box},{role:"recipient_account",box:[0,0,1000,1000]},{role:"unknown",box:null}]){
 const parts=await prepareLocatedAccountParts({...args,loadCodec,fetchFn:async()=>reply(bad)});
 assert.equal(parts.length,1);
}
assert.equal(await locateAccountRegion({...args,signal:AbortSignal.abort()}),null);
assert.equal(await locateAccountRegion({...args,fetchFn:async()=>{throw Error("transport")}}),null);
console.log("Legacy account localization and original-only fallbacks passed.");
