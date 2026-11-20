// CHAT-417: first transcribe printed image text, then propose only evidenced
// customer order rows. No Storage/DB writes, auto-sends or inventory changes.
export const PROMPT=[
 'You read Vietnamese typed/printed customer stock-request images.',
 'First transcribe visible text line by line, THEN decide whether it is a customer goods order.',
 'Read ONLY visible printed/typed text. Do not invent goods, prices or quantities.',
 'Return JSON only: {"classification":"typed_stock_list"|"other",',
 '"text_lines":["each visible text line in source order, including notes or price changes"],',
 '"lines":[{"raw":"complete literal printed product line","name":"product name including size, excluding price and quantity"|"",',
 '"quantity":integer|null,"unit":"thùng"|"lốc"|"bao"|"..."|null,"uncertain":true|false}],',
 '"notes":["unclear or unreadable text"]}.',
 'Classify a customer list requesting goods and quantities as typed_stock_list.',
 'Bank receipts, supplier invoices with payment totals, photos without order text and ordinary chat are other.',
 'A chat screenshot is typed_stock_list ONLY if it clearly contains a product order with quantities.',
 'Always transcribe legible typed text into text_lines even if classification is other.',
 'Preserve original spelling, order, price changes, units and product sizes 250, 500, 1KG, 400, 800, 1.2, 5kg.',
 'Numbers before * or × can be prices or sizes, NOT order quantities.',
 'For "Tương ớt 250 - 370 *5 THÙNG", quantity is 5, NOT 250 or 370.',
 'For "Dầu mezan 1L 549*10 thùng", quantity is 10; 549 is NOT quantity.',
 'For "Cháo gấu đỏ gà - 150 *5", quantity is 5; 150 is NOT quantity.',
 'For "Kopico sữa SL3" quantity is 3; "454 10t" means 10 thùng, not 454.',
 'For "Sữa Nuvi ... mỗi màu 1 thùng = Tổng 5 thùng", quantity null and uncertain.',
 'A newer photo can be a corrected version: never sum across photos or silently replace either.',
 'For any doubtful product/quantity, keep the literal text and note but omit it from order lines.',
 'Read at most 80 visible text lines and at most 60 proposed order lines.'
].join('\n');

const limitText=(value,max)=>String(value??'').trim().slice(0,max);
function visibleLines(source){
 const primary=Array.isArray(source?.text_lines)?source.text_lines:
  typeof source?.raw_text==='string'?source.raw_text.split(/\r?\n/u):[];
 const lines=primary.map(x=>limitText(x,260)).filter(Boolean).slice(0,80);
 if(lines.length)return lines;
 // Compatibility with older OCR responses, which only returned product rows.
 return (Array.isArray(source?.lines)?source.lines:[])
  .map(row=>limitText(row?.raw,260)).filter(Boolean).slice(0,80);
}
function literalQuantityMatches(rawLine,quantity){
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>999)return false;
 // Explicit operators or SL take precedence over any terminal unit.
 const ops=[...rawLine.matchAll(/(?:[*×]|\bx\s*)(\d{1,3})(?!\d)/giu)];
 if(ops.length)return ops.length===1&&Number(ops[0][1])===quantity;
 const sl=[...rawLine.matchAll(/(?:^|\s)(?:sl|số lượng)\s*[:=]?\s*(\d{1,3})(?!\d)/giu)];
 if(sl.length)return sl.length===1&&Number(sl[0][1])===quantity;
 // A printed terminal package is evidence; never use weight/size (kg, L)
 // as an order quantity without an explicit operator or SL.
 const unit=rawLine.match(/(?:^|\s)(\d{1,3})\s*(thùng|th|t|lốc|hộp|bao|bịch|gói|chai|lon)\s*$/iu);
 return Boolean(unit)&&Number(unit[1])===quantity;
}
export function parseStockImageModel(raw){
 const source=raw&&typeof raw==='object'?raw:{};
 const typed=source.classification==='typed_stock_list';
 const textLines=visibleLines(source);
 const rows=[],notes=[];
 const addNote=value=>{
  const note=limitText(value,240);
  if(note&&notes.length<60&&!notes.includes(note))notes.push(note);
 };
 if(Array.isArray(source.notes))
  for(const note of source.notes.slice(0,60))addNote(note);
 if(typed)for(const row of (Array.isArray(source.lines)?source.lines:[]).slice(0,60)){
  const rawLine=limitText(row?.raw,260);
  const name=limitText(row?.name,120);
  const qty=row?.quantity===null||row?.quantity===undefined?NaN:Number(row.quantity);
  if(!rawLine)continue;
  const ambiguous=/mỗi\s+màu|tổng\s+\d{1,3}\s*thùng|giá\s+(?:tăng|giảm)|\(\+\d+\)/iu.test(rawLine);
  const confirmed=!row?.uncertain&&!ambiguous&&literalQuantityMatches(rawLine,qty);
  if(!name||name.length<2||/[<>]/u.test(name)||!confirmed){
   addNote(rawLine);
   continue;
  }
  rows.push({
   name,qty,unit:limitText(row?.unit,25),raw:rawLine,review:true
  });
 }
 return {classification:typed?'typed_stock_list':'other',lines:rows,
  text_lines:textLines,raw_text:textLines.join('\n'),notes:typed?notes:[]};
}
export async function readStockImageWithGemini({bytes,mime,key,fetcher=fetch}){
 if(!key)throw Error('ai_not_configured');
 if(!bytes?.length||bytes.length>4000000||
  !['image/png','image/jpeg','image/webp'].includes(mime))throw Error('invalid_image');
 const chunks=[];
 for(let i=0;i<bytes.length;i+=8192)
  chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
 const base64=btoa(chunks.join(''));
 const body={contents:[{role:'user',parts:[
  {text:PROMPT},{inline_data:{mime_type:mime,data:base64}}
 ]}],generationConfig:{temperature:0,responseMimeType:'application/json',maxOutputTokens:4400}};
 const response=await fetcher(
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key='+encodeURIComponent(key),
  {method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify(body),signal:AbortSignal.timeout(30000)}
 );
 if(!response.ok)throw Error('ai_unavailable');
 const res=await response.json();
 const text=String(res?.candidates?.[0]?.content?.parts?.find(p=>typeof p.text==='string')?.text||'');
 if(!text)throw Error('ai_empty');
 try{
  return parseStockImageModel(JSON.parse(text.trim()
   .replace(/^\x60{3}(?:json)?\s*/iu,'').replace(/\s*\x60{3}$/u,'')));
 }catch{throw Error('ai_invalid_json');}
}
