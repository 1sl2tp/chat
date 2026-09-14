function clean(value,max=6000){
  return String(value??'').replace(/\r\n?/g,'\n').trim().slice(0,max);
}
function positiveNumber(value){
  const number=Number(String(value??'').replace(',','.'));
  return Number.isFinite(number)&&number>0?number:null;
}
function positiveInteger(value){
  const number=Number(value);
  return Number.isInteger(number)&&number>0?number:null;
}
function seqOf(row){
  const value=Number(row?.messageSeq??row?.message_seq);
  return Number.isSafeInteger(value)&&value>0?value:null;
}

export function selectContiguousBatch(messages,limits={}){
  const maxMessages=Math.max(1,Number(limits?.maxMessages)||25);
  const maxChars=Math.max(1,Number(limits?.maxChars)||5000);
  const maxImages=Math.max(0,Number(limits?.maxImages)||8);
  const rows=(Array.isArray(messages)?messages:[]).slice().sort((a,b)=>(seqOf(a)||0)-(seqOf(b)||0));
  const out=[];
  let chars=0;
  let images=0;
  for(const row of rows){
    if(out.length>=maxMessages)break;
    const body=clean(row?.body,maxChars+1);
    const imageCount=Math.max(0,Number(row?.imageCount??row?.image_count)||0);
    const nextChars=chars+body.length;
    const nextImages=images+imageCount;
    if(out.length&&(nextChars>maxChars||nextImages>maxImages))break;
    if(!out.length&&(body.length>maxChars||imageCount>maxImages))throw new Error('scan_source_too_large');
    out.push(row);
    chars=nextChars;
    images=nextImages;
  }
  return out;
}

export function buildSourceEnvelope(messages){
  return (Array.isArray(messages)?messages:[]).map(row=>{
    const seq=seqOf(row);
    const id=clean(row?.id,200);
    if(!seq||!id)throw new Error('scan_source_invalid');
    const body=clean(row?.body,6000);
    return `[MSG_SEQ=${seq};MSG_ID=${id}]\n${body}`.trimEnd();
  }).join('\n\n');
}

export function materializeScanLines(items,messageBySeq){
  const sourceMap=messageBySeq instanceof Map?messageBySeq:new Map();
  const rows=[];
  for(const item of Array.isArray(items)?items:[]){
    const sourceMessageSeq=positiveInteger(item?.sourceMessageSeq??item?.source_message_seq);
    const sourceLineNo=positiveInteger(item?.sourceLineNo??item?.source_line_no);
    const quantity=positiveNumber(item?.quantity);
    const name=clean(item?.name,500);
    const rawText=clean(item?.rawText??item?.raw_text,1000);
    const source=sourceMap.get(sourceMessageSeq);
    const sourceId=clean(source?.id,200);
    if(!sourceMessageSeq||!sourceLineNo||!quantity||!name||!sourceId)throw new Error('scan_source_invalid');
    rows.push({
      source_message_id:sourceId,
      source_message_seq:sourceMessageSeq,
      source_line_no:sourceLineNo,
      quantity,
      name,
      raw_text:rawText,
    });
  }
  rows.sort((a,b)=>a.source_message_seq-b.source_message_seq||a.source_line_no-b.source_line_no);
  return rows;
}
