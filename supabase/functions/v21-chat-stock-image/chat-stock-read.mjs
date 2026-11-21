// CHAT-425: same reviewed pure OCR parser as CHAT-409; isolated customer-photo Edge function.
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
 'For "Sua nuvi to - 291 -> 293 (+2) lấy cho chị mỗi màu 1 thùng =Tổng 5 thùng", write ONE product Sua nuvi to with quantity 5 thùng; the middle text is a note, not a new item.',
 'Only an explicit final Tổng N thùng is authoritative here; neither 291, 293, +2 nor mỗi màu 1 is the total.',
 'Never sum across photos: a newer photo can be a corrected version.',
 'Read at most 60 visible lines; on any doubt put literal raw in notes, omit quantity.'
].join('\n');
// CHAT-426: the literal "=Tổng N thùng" is an explicit quantity, not
// uncertainty. It must remain one product even when a per-color instruction
// and price revision precede the total. Never infer any color count or price.
export function parseNamedTotalPack(rawValue){
 const raw=String(rawValue||'').trim().slice(0,260);
 const match=raw.match(/^(.{2,120}?)\s+[-–—]\s+(.+?)\s*=\s*tổng\s+(\d{1,3})\s+(thùng)\s*$/iu);
 if(!match||!/mỗi\s+màu/iu.test(match[2]))return null;
 const name=match[1].trim(),note=match[2].trim(),qty=Number(match[3]);
 if(!/[\p{L}]/u.test(name)||/[<>]/u.test(name)||
    /^(?:giá|cộng|tổng|thành tiền|tiền hàng)(?:\s|$)/iu.test(name)||
    !Number.isSafeInteger(qty)||qty<1||qty>999)return null;
 return {name,qty,unit:match[4].toLowerCase(),note,raw,review:true};
}
export function parseStockImageModel(raw){
 const source=raw&&typeof raw==='object'?raw:{};
 if(source.classification!=='typed_stock_list')
  return {classification:'other',lines:[],notes:[]};
 const rows=[],notes=[],noteKeys=new Set(),resolvedKeys=new Set();
 const key=value=>String(value||'').trim().replace(/\s+/gu,' ').toLocaleLowerCase('vi-VN');
 const addNote=value=>{
  const note=String(value||'').trim().slice(0,240);
  const id=key(note);
  if(note&&!noteKeys.has(id)&&notes.length<60){noteKeys.add(id);notes.push(note);}
 };
 const addExplicit=value=>{
  const found=parseNamedTotalPack(value),id=key(value);
  if(!found||resolvedKeys.has(id)||rows.length>=60)return false;
  resolvedKeys.add(id);
  rows.push(found);
  return true;
 };
 for(const row of (Array.isArray(source.lines)?source.lines:[]).slice(0,60)){
  const rawLine=String(row?.raw||'').trim().slice(0,260);
  if(!rawLine)continue;
  if(addExplicit(rawLine))continue;
  const name=String(row?.name||'').trim().slice(0,120);
  const qty=Number(row?.quantity);
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
 // The model can report this complete row as only a note. Recover from
 // exact text evidence, but never extract a quantity from any other note.
 for(const line of (Array.isArray(source.notes)?source.notes:[]).slice(0,60)){
  if(addExplicit(line))continue;
  addNote(line);
 }
 return {classification:'typed_stock_list',lines:rows,
  notes:notes.filter(value=>!resolvedKeys.has(key(value)))};
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