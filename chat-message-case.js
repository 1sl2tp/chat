/* CHAT-415 — one display-only casing policy for both Chat A and Chat B.
   NEVER mutate a message, OCR result, DB row, clipboard source or send payload.
   The unmodified canonical text remains available through the existing model. */
(()=>{
'use strict';
const SAFE_ACRONYMS=new Set([
 'KH','NCC','CM','SL','STT','STK','TK','QR','OTP','OCR','AI','API',
 'PWA','APK','SMS','ID','URL','IMEI','IBAN','VAT','VND','USD',
 'PDF','PNG','JPG','JPEG','ZALO','TAPHOA','HTML','CSS','JS','USB','GB','MB'
]);
// Ordinary Vietnamese words, including two-letter "EM", "CÓ", "CHỊ",
// must become sentence case; keep only technical abbreviations above.
// URLs and email addresses remain byte-for-byte identical on screen.
const WORD=/(?:https?:\/\/|www\.)[^\s]+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|[\p{L}][\p{L}\p{M}\p{N}_-]*/giu;
const LETTER=/\p{L}/u;
const CODE_WITH_DIGIT=/[\p{L}][\p{L}\p{N}_-]*[\p{N}][\p{L}\p{N}_-]*/u;
const PROTECTED_ELEMENTS='.message-link,.message-inline-code,code,pre,.incoming-brief-review,.incoming-brief-original-text,.message-zalo-phone-copy';

function formatPiece(value,firstPending=true){
 const input=String(value??'');
 let result='',cursor=0,needsCapital=Boolean(firstPending);
 for(const match of input.matchAll(WORD)){
  const raw=match[0],start=match.index||0;
  result+=input.slice(cursor,start);
  // Links are emitted as anchors by the rich renderer. Protect raw URLs,
  // emails and identifier-like tokens here as defense in depth as well.
  const previous=start>0?input[start-1]:'';
  const preserve=/^(?:https?:\/\/|www\.)|@/iu.test(raw)||
    SAFE_ACRONYMS.has(raw.toLocaleUpperCase('vi-VN'))||
    CODE_WITH_DIGIT.test(raw)||/\d/u.test(previous)||
    /[a-z][A-Z]/u.test(raw)||/[_]/u.test(raw);
  let next=preserve?raw:raw.toLocaleLowerCase('vi-VN');
  if(needsCapital&&!preserve){
   next=next.replace(LETTER,c=>c.toLocaleUpperCase('vi-VN'));
  }
  result+=next;
  needsCapital=false;
  cursor=start+raw.length;
 }
 result+=input.slice(cursor);
 return {text:result,firstPending:needsCapital};
}
// A new source line starts a new sentence. Keep empty lines as-is.
function sentenceCase(value){
 return String(value??'').split('\n').map(part=>formatPiece(part).text).join('\n');
}
// A one-line preview is the SAME display policy as message text, but the
// sender prefix belongs to the UI and each preview body starts a new sentence.
// Do not change canonical sender names, stored preview_text or message payloads.
function previewCase(value){
 const text=String(value??'').replace(/\s+/gu,' ').trim();
 const outgoing=text.match(/^Bạn\s*:\s*(.*)$/iu);
 if(outgoing)return 'Bạn: '+formatPiece(outgoing[1]).text;
 return formatPiece(text).text;
}
function isProtected(node){
 return Boolean(node?.matches?.(PROTECTED_ELEMENTS));
}
// Rich text is parsed from the original text. Case only the text nodes in
// the painted message DOM so link.href, inline code, markup and raw OCR
// source are never modified. First-letter state is shared across <strong>
// and other inline spans of a single rendered line.
function formatRenderedLine(node){
 let firstPending=true;
 function visit(current){
  if(!current)return;
  if(current.nodeType===3){
   const updated=formatPiece(current.textContent,firstPending);
   current.textContent=updated.text;
   firstPending=updated.firstPending;
   return;
  }
  if(current.nodeType!==1)return;
  if(isProtected(current)){
   if(LETTER.test(current.textContent||''))firstPending=false;
   return;
  }
  for(const child of Array.from(current.childNodes||[]))visit(child);
 }
 visit(node);
}
function normalizeRendered(root){
 if(!root?.querySelectorAll)return root;
 for(const node of root.querySelectorAll(
  '.message-rich-line,.message-rich-heading,.message-rich-quote,'+
  '.message-rich-list > li,.reply-quote-text,'+
  '.incoming-brief-product,.incoming-brief-note'
 )){
   if(node.closest?.('.incoming-brief-original'))continue;
   formatRenderedLine(node);
 }
 return root;
}
globalThis.V21ChatMessageCase=Object.freeze({sentenceCase,previewCase,normalizeRendered});
})();
