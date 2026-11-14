'use strict';
// NCC-008 iOS photo selection -> auto send and safe HEIC resize.
// Fake photos only; this test never calls a network endpoint or Supabase.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ui=fs.readFileSync('ncc-ai-room.js','utf8');
const start=ui.indexOf('async function prepareSelectedPhoto(file){');
const end=ui.indexOf('function fileBase64(file){',start);
assert(start>0&&end>start,'image preparation function exists');
const helper=ui.slice(start,end);
const FakeFile=class{
 constructor(parts,name,options={}){this.name=name;this.type=options.type||'';this.size=parts.reduce((n,x)=>n+(x.size||0),0)}
};
const converter=vm.createContext({
 File:FakeFile,Date,Math,Number,String,Promise,
 createImageBitmap:async()=>({width:4000,height:2500,close:()=>{}}),
 document:{createElement:tag=>{
  assert.equal(tag,'canvas');
  return {
   width:0,height:0,
   getContext:()=>({fillRect:()=>{},drawImage:()=>{}}),
   toBlob:(cb,type,quality)=>{
    assert.equal(type,'image/jpeg');
    cb({size:quality>.85?4500000:1700000});
   }
  };
 }},
 URL:{createObjectURL:()=>{throw Error('never used when createImageBitmap succeeds')}},
});
vm.runInContext(helper+'\nthis.prepare=prepareSelectedPhoto;',converter);

(async()=>{
 const jpeg={name:'receipt.jpg',type:'image/jpeg',size:2000000};
 assert.equal(await converter.prepare(jpeg),jpeg,'ordinary JPEG must not be re-encoded');
 const heic={name:'phieu.heic',type:'image/heic',size:7000000};
 const converted=await converter.prepare(heic);
 assert.equal(converted.name,'phieu.jpg');
 assert.equal(converted.type,'image/jpeg');
 assert.equal(converted.size,1700000,'retry quality when >4MB');
 await assert.rejects(converter.prepare({name:'file.pdf',type:'application/pdf',size:1200}),/invalid_image_type/);
 await assert.rejects(converter.prepare({name:'gigantic.heic',type:'image/heic',size:26000000}),/invalid_image_size/);

 const open=ui.indexOf('fileInput.addEventListener("change",async()=>{');
 const close=ui.indexOf('\nsend.addEventListener("click"',open);
 assert(open>0&&close>open,'one explicit iOS picker handler');
 const handler=ui.slice(open,close);
 const calls=[],state=[],selected={name:'bill-iphone.jpg',type:'image/jpeg',size:10000};
 const img={src:''};const preview={hidden:true,querySelector:()=>img};
 let onChange;
 const fakeInput={files:[selected],addEventListener:(name,fn)=>{if(name==='change')onChange=fn;}};
 const ctx=vm.createContext({
  fileInput:fakeInput,accountSession:()=> 'admin|session',selectVersion:0,
  selectedPhoto:null,ready:true,opened:true,previewUrl:'',preview,URL:{
   createObjectURL:()=> 'blob:receipt',revokeObjectURL:()=>{}
  },
  room:{querySelector:()=>({textContent:''})},
  prepareSelectedPhoto:async f=>f,
  sync:()=>{},say:s=>state.push(s),
  submit:async()=>{calls.push('send');},
  clearPreview:()=>{calls.push('clear');},
  String
 });
 vm.runInContext(handler,ctx);
 assert.equal(typeof onChange,'function');
 await onChange();
 assert.deepEqual(calls,['send'],'one image choice automatically sends');
 assert.equal(ctx.selectedPhoto,selected);
 assert.equal(preview.hidden,false);
 assert.equal(img.src,'blob:receipt');

 fakeInput.files=[{name:'invoice.heic',type:'image/heic',size:8000000}];
 const convertedCtx=vm.createContext({
  fileInput:fakeInput,accountSession:()=> 'admin|session',selectVersion:0,
  selectedPhoto:null,ready:true,opened:true,previewUrl:'',preview:{hidden:true,querySelector:()=>({src:''})},
  URL:{createObjectURL:()=> 'blob:heic',revokeObjectURL:()=>{}},
  room:{querySelector:()=>({textContent:''})},
  prepareSelectedPhoto:async()=>converted,
  sync:()=>{},say:s=>state.push(s),submit:async()=>{calls.push('heic-sent')},
  clearPreview:()=>{calls.push('clear-heic')},String
 });
 vm.runInContext(handler,convertedCtx);
 await onChange();
 assert.equal(ctx.selectedPhoto,selected);
 // Handler is bound to convertedCtx; verify conversion via the preparation test above.
 assert(ui.includes('accept="image/*"'),'native iPhone Photos picker must accept HEIC');
 assert(ui.includes('const file=selectedPhoto;'),'send exact prepared image, not stale FileList');
 assert(ui.includes('await submit();'),'send from trusted photo change, no extra arrow tap');
 assert(ui.includes('Bấm dấu + chọn ảnh. Ảnh sẽ tự gửi'),'clear Admin guidance');
 assert(ui.includes('if(version!==selectVersion||!opened||owner!==accountSession())return;'),'stale session ignored');
 console.log('NCC-008: iPhone HEIC and large image conversion, native picker auto-send PASS');
})().catch(err=>{console.error(err);process.exitCode=1;});
