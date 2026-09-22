const fs=require('fs'),assert=require('assert'),path=require('path');

const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');

function fn(name){
  const start=app.indexOf(`function ${name}`);
  const asyncStart=app.indexOf(`async function ${name}`);
  const at=start>=0?start:asyncStart;
  assert(at>=0,`missing ${name}`);
  const next=app.indexOf('\nfunction ',at+10);
  const nextAsync=app.indexOf('\nasync function ',at+10);
  const candidates=[next,nextAsync].filter(v=>v>at);
  const end=candidates.length?Math.min(...candidates):app.length;
  return app.slice(at,end);
}

const prepare=fn('prepareImageAttachment');
assert(!/hasDuplicateImageHash|showDuplicateUploadWarning|duplicate_image/.test(prepare),
  'historical image hash must not block a new attachment');
assert(/const contentHash=await sha256Blob\(optimized\.blob\)/.test(prepare),
  'content hash remains metadata for media integrity');

assert(!/Bạn đã tải lên tệp này từ trước/.test(app),
  'historical duplicate warning modal must be removed');

const pasteDedupe=fn('dedupeClipboardFiles');
assert(/const seen=new Set\(\)/.test(pasteDedupe),
  'one clipboard transaction still needs transport-level dedupe');
assert(/dedupeClipboardFiles\(\[\.\.\.direct,\.\.\.itemFiles\]\)/.test(app),
  'files/items from the same paste must collapse to one image');

const filePrepare=fn('prepareFileAttachment');
assert(!/duplicate|contentHash|findByContentHash/i.test(filePrepare),
  'document file attachments must not be blocked as historical duplicates');

console.log('repeat image/file upload contract PASS');
