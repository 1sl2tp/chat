// CHAT-409: ephemeral, admin-only printed stock-list OCR.
// Pure normalization; no Storage or Postgres writes, no customer messages.
export const PROMPT=[
 'You read Vietnamese typed/printed customer stock-request images.',
 'Read ONLY visible printed/typed text. Do not infer goods, prices or quantities.',
 'Classify bank receipts, invoices with payment totals, private photos, screenshots of ordinary chat as other.',
 'A list of requested products/packaging on yellow/white backgrounds is typed_stock_list.',
 'Return JSON only: {"classification":"typed_stock_list"|"other",',
 '"lines":[{"raw":"complete literal printed line","name":"printed product name before a price/quantity"|"",',
 '"quantity":integer|null,"unit":"thùng"|"lốc"|"bao"|"..."|null,"uncertain":true|false}],',
 '"notes":["unreadable or ambiguous lines"]}.',
 'Preserve original line order, spelling and sizes: 250, 500, 1KG, 400, 800, 1.2, 5kg.',
 'Numbers before * or × can be prices or sizes, NOT order quantities.',
 'For "Tương ớt 250 - 370 *5 THÙNG", quantity is 5, NOT 250 or 370.',
 'For "Dầu mezan 1L 549*10 thùng", quantity is 10; 549 is NOT quantity.',
 'For "Cháo gấu đỏ gà - 150 *5", quantity is 5; 150 is NOT quantity.',
 'For "Sữa Nuvi ... mỗi màu 1 thùng = Tổng 5 thùng", quantity null and uncertain.',
 'Never sum across photos: a newer photo can be a corrected version.',
 'Read at most 60 visible lines; on any doubt put literal raw in notes, omit quantity.'
].join('\n');
export function parseStockImageModel(raw){
 const source=raw&&typeof raw==='object'?raw:{};
 const typed=source.classification==='typed_stock_list';
 const rows=[],notes=[];
 const addNote=value=>{const note=String(value||'').trim().slice(0,240);if(note&&notes.length<60)notes.push(note)};
 if(Array.isArray(source.notes))for(const note of source.notes.slice(0,60))addNote(note);
 if(!typed)return {classification:'other',lines:[],notes:[]};
 for(const row of (Array.isArray(source.lines)?source.lines:[]).slice(0,60)){
  const rawLine=String(row?.raw||'').trim().slice(0,260);
  const name=String(row?.name||'').trim().slice(0,120);
  const qty=Number(row?.quantity);
  if(!rawLine)continue;
  const multi=/mỗi\s+màu|tổng\s+\d{1,3}\s*thùng|giá\s+(?:tăng|giảm)|\(\+\d+\)/iu.test(rawLine);
  const starMatch=rawLine.match(/[*×]\s*(\d{1,3})(?!\d)/u);
  const qtyEvidence=starMatch?Number(starMatch[1])===qty:
   new RegExp('(?:^|\\s)(?:sl|số lượng)\\s*[:=]?\\s*'+qty+'(?!\\d)','iu').test(rawLine);
  const finalQuantity=Number.isSafeInteger(qty)&&qty>=1&&qty<=999&&!multi&&qtyEvidence?
    qty:null;
  if(!name||name.length<2||/[<>]/u.test(name)||finalQuantity===null){
   addNote(rawLine);
   continue;
  }
  const pack=String(row?.unit||'').trim().slice(0,25);
  rows.push({name,qty:finalQuantity,unit:pack,raw:rawLine,review:true});
 }
 return {classification:'typed_stock_list',lines:rows,notes};
}
export async function readStockImageWithGemini({bytes,mime,key,fetcher=fetch}){
 if(!key)throw Error('ai_not_configured');
 if(!bytes?.length||bytes.length>4000000||!['image/png','image/jpeg','image/webp'].includes(mime))
  throw Error('invalid_image');
 const chunks=[];
 for(let i=0;i<bytes.length;i+=8192)chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
 const base64=btoa(chunks.join(''));
 const body={contents:[{role:'user',parts:[
  {text:PROMPT},{inline_data:{mime_type:mime,data:base64}}
 ]}],generationConfig:{temperature:0,responseMimeType:'application/json',maxOutputTokens:3200}};
 const response=await fetcher(
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key='+encodeURIComponent(key),
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)}
 );
 if(!response.ok)throw Error('ai_unavailable');
 const res=await response.json();
 const text=String(res?.candidates?.[0]?.content?.parts?.find(p=>typeof p.text==='string')?.text||'');
 if(!text)throw Error('ai_empty');
 try{
  return parseStockImageModel(JSON.parse(text.trim().replace(/^\x60{3}(?:json)?\s*/iu,'').replace(/\s*\x60{3}$/u,'')));
 }catch{throw Error('ai_invalid_json');}
}