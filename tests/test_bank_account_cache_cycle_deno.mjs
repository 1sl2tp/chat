// Synthetic-only integration: real JPEG codec, simulated model and RPCs.
// No network, customer images, credentials or production database.
import assert from "node:assert/strict";
import jpeg from "npm:jpeg-js@0.4.4";
import {runAccountBenchmark} from "../supabase/functions/v21-bank-bill-event/bill-account-benchmark.mjs";
const region={role:"recipient_account",box:[420,180,550,820]};
const expected="2901181999999",digits=[...expected];
const proof={role:"recipient_account",clear:true,visible:expected,digits,reverse_digits:[...digits].reverse(),digit_count:13,trailing_nines:6};
const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",b)),x=>x.toString(16).padStart(2,"0")).join("");
const images=[];
for(let i=0;i<14;i++){
 const width=320,height=200,data=new Uint8Array(width*height*4).fill(255);
 for(let y=90;y<105;y++)for(let x=75;x<240;x++){const p=(y*width+x)*4;data[p]=data[p+1]=data[p+2]=(i*13)%200;}
 const bytes=jpeg.encode({width,height,data},95).data;
 images.push({bytes,sha:await digest(bytes)});
}
assert.equal(new Set(images.map(x=>x.sha)).size,14);
const cache=new Map();
let leaseNo=0, modelCalls=0;
async function run(img,id,{badProof=false,cacheUnavailable=false}={}){
 const lease_id="lease-"+(++leaseNo),job={id,lease_id,image_sha256:img.sha,storage_key:"fixture.jpg",mime_type:"image/jpeg",region:null};
 const key=id+":"+img.sha+":1";
 let finished=false;
 const db={rpc:async(name,args)=>{
  if(name==="v0_bill_crop_benchmark_claim")return {data:job};
  assert.equal(finished,false);
  if(name==="v0_bill_crop_benchmark_finish"){
   assert.equal(args.p_id,id);assert.equal(args.p_lease,lease_id);
   finished=true;return {data:args.p_state};
  }
  assert.equal(args.p_kind,"benchmark");assert.equal(args.p_id,id);assert.equal(args.p_lease,lease_id);assert.equal(args.p_sha,img.sha);assert.equal(args.p_version,1);
  if(cacheUnavailable)return {error:{message:"fixture offline"}};
  if(name==="v0_bill_account_region_cache_get")return {data:cache.get(key)??null};
  if(name==="v0_bill_account_region_cache_put"){assert.deepEqual(args.p_region,region);cache.set(key,args.p_region);return {data:true};}
  if(name==="v0_bill_account_region_cache_remove")return {data:cache.delete(key)};
  throw Error("unexpected RPC");
 },storage:{from(bucket){assert.equal(bucket,"v21-media");return {download:async path=>{assert.equal(path,job.storage_key);return {data:new Blob([img.bytes])};}};}}};
 const fetchFn=async(_url,opts)=>{
  modelCalls++;
  const p=JSON.parse(opts.body),locate=!!p.generationConfig.responseJsonSchema;
  assert(!opts.body.includes(expected));
  const imageParts=p.contents[0].parts.filter(x=>x.inlineData);
  assert.equal(imageParts.length,locate?1:2);
  const value=locate?region:badProof?{...proof,clear:false}:proof;
  return {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]})};
 };
 const result=await runAccountBenchmark({db,key:"fixture",digest,fetchFn});
 assert(finished);assert.equal(result.ledger_written,false);
 return result;
}
let cold=0,warm=0;
for(const [i,img] of images.entries()){
 const out=await run(img,"bill-"+i);
 assert.equal(out.state,"verified");assert.equal(out.crop_used,true);assert.equal(out.requests,2);cold+=out.requests;
}
assert.equal(cache.size,14);
for(const [i,img] of images.entries()){
 const out=await run(img,"bill-"+i);
 assert.equal(out.state,"verified");assert.equal(out.crop_used,true);assert.equal(out.requests,1);warm+=out.requests;
}
assert.equal(cold,28);assert.equal(warm,14);assert.equal(modelCalls,42);
assert.equal((await run(images[1],"bill-0")).requests,2,"same receipt changed image must miss");
assert.equal((await run(images[0],"bill-0",{badProof:true})).state,"needs_review");
assert(!cache.has("bill-0:"+images[0].sha+":1"));
assert.equal((await run(images[0],"bill-0")).requests,2,"failed proof invalidates coordinate");
assert.equal((await run(images[0],"offline",{cacheUnavailable:true})).requests,2,"cache outage must fall back");
console.log("Synthetic 14-JPEG cycle: cold="+cold+", warm="+warm+", exact/crop=14/14 each; changed hash, proof failure and outage passed.");
