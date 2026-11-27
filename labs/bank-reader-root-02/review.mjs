import {FIELDS,validBox,validate} from "./reader.mjs";
// Offline-only annotation + evaluation. No remote access.
export function boxFromPoints(a,b,width,height){
 if(![a.x,a.y,b.x,b.y,width,height].every(Number.isFinite)||width<=0||height<=0)throw Error("geometry");
 const norm=(x,s)=>Math.round(Math.max(0,Math.min(s,x))/s*1000);
 const box=[norm(Math.min(a.y,b.y),height),norm(Math.min(a.x,b.x),width),norm(Math.max(a.y,b.y),height),norm(Math.max(a.x,b.x),width)];
 if(!validBox(box))throw Error("box_too_small");return box;
}
export function labelState(label,hash){
 if(!/^[a-f0-9]{64}$/.test(hash)||label?.image_sha256!==hash||label.source!=="human_reviewed_original"||label.reviewed!==true)return "unverified";
 if(label.state==="missing"&&label.text===null&&Array.isArray(label.boxes)&&label.boxes.length===0)return "verified";
 if(label.state==="clear"&&typeof label.text==="string"&&label.text.trim()&&Array.isArray(label.boxes)&&label.boxes.length>0&&label.boxes.length<=12&&label.boxes.every(validBox))return "verified";
 return "unverified";
}
// Exact union intersection area, not enclosing-box overlap for multiline text.
function area(rects){
 if(!rects.length)return 0;
 const xs=[...new Set(rects.flatMap(b=>[b[1],b[3]]))].sort((a,b)=>a-b);
 let total=0;
 for(let i=1;i<xs.length;i++){
  const l=xs[i-1],r=xs[i],ys=rects.filter(b=>b[1]<r&&b[3]>l).map(b=>[b[0],b[2]]).sort((a,b)=>a[0]-b[0]);
  let len=0,start=null,end=null;
  for(const [y,z] of ys){if(start===null){start=y;end=z;}else if(y<=end)end=Math.max(end,z);else{len+=end-start;start=y;end=z;}}
  if(start!==null)len+=end-start;total+=(r-l)*len;
 }return total;
}
export function regionIoU(a,b){
 if(!a.length||!b.length||!a.every(validBox)||!b.every(validBox))return null;
 const intersections=[];for(const p of a)for(const q of b){const x=[Math.max(p[0],q[0]),Math.max(p[1],q[1]),Math.min(p[2],q[2]),Math.min(p[3],q[3])];if(validBox(x))intersections.push(x);}
 const i=area(intersections),u=area([...a,...b]);return u?i/u:null;
}
export function scoreSample(gold,raw,metrics){
 if(!gold||gold.frame_confirmed!==true||gold.coordinate_frame!=="displayed_original"||!FIELDS.every(k=>labelState(gold.fields[k],gold.image_sha256)==="verified"))return {state:"unverified_gold"};
 if(!["receipt","journal","notification","non_bill","unknown"].includes(gold.kind)||gold.kind_reviewed!==true)return {state:"unverified_gold"};
 if(!metrics||metrics.image_sha256!==gold.image_sha256||metrics.pass!==1||metrics.requests!==1||!Number.isFinite(metrics.elapsed_ms)||metrics.elapsed_ms<0)return {state:"invalid_measurement"};
 let a;try{a=validate(raw);}catch{return {state:"invalid_response",exact:0,total:10,kind_match:false,requests:metrics.requests,elapsed_ms:metrics.elapsed_ms};}
 const fields={};let exact=0,regionSum=0,regions=0;
 for(const k of FIELDS){const g=gold.fields[k],p=a.fields[k];const match=g.state===p.state&&g.text===p.text;const iou=g.state==="clear"?regionIoU(g.boxes,p.boxes)??0:null;
  fields[k]={exact:match,iou};exact+=Number(match);if(iou!==null){regionSum+=iou;regions++;}}
 return {state:"scored",exact,total:10,kind_match:a.kind===gold.kind,field_scores:fields,mean_iou:regions?regionSum/regions:null,requests:metrics.requests,elapsed_ms:metrics.elapsed_ms};
}

// Resume only labels that are tied to bytes already opened locally.
// Imported review data is an assertion from a reviewer, not authenticated proof.
export function restoreReview(sample,entry){
 if(!entry||entry.image_sha256!==sample.image_sha256||entry.coordinate_frame!=="displayed_original"||typeof entry.frame_confirmed!=="boolean")throw Error("resume_identity");
 if(!["receipt","journal","notification","non_bill","unknown"].includes(entry.kind)&&entry.kind!==null)throw Error("resume_kind");
 const fields={};
 for(const k of FIELDS){
  if(!Object.hasOwn(entry.fields||{},k))continue;
  const f=entry.fields[k];
  if(labelState(f,sample.image_sha256)!=="verified")throw Error("resume_field:"+k);
  fields[k]=JSON.parse(JSON.stringify(f));
 }
 return {...sample,fields,kind:entry.kind,kind_reviewed:entry.kind_reviewed===true&&entry.kind!==null,frame_confirmed:false};
}
export function exportReview(sample){
 const {file,...s}=sample;
 return {...s,coordinate_frame:"displayed_original",kind_reviewed:s.kind_reviewed===true,frame_confirmed:s.frame_confirmed===true,fields:s.fields};
}
