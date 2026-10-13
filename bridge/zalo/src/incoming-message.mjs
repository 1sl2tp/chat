const USER_THREAD_TYPE=0;
const GROUP_THREAD_TYPE=1;

function eventAtFromTs(value){
  const raw=Number(value);
  if(!Number.isFinite(raw)||raw<=0)return new Date().toISOString();
  const ms=raw<1e12?raw*1000:raw;
  return new Date(ms).toISOString();
}

function objectValue(value){
  if(value&&typeof value==='object'&&!Array.isArray(value))return value;
  if(typeof value!=='string')return null;
  const source=value.trim();
  if(!source.startsWith('{'))return null;
  try{
    const parsed=JSON.parse(source);
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;
  }catch{return null;}
}

function numberOrNull(...values){
  for(const value of values){
    const n=Number(value);
    if(Number.isFinite(n)&&n>0)return Math.round(n);
  }
  return null;
}

function paramsValue(content){
  const raw=content?.params;
  if(raw&&typeof raw==='object')return raw;
  if(typeof raw==='string'){
    try{return JSON.parse(raw)||{};}catch{}
  }
  return{};
}

function imageMimeFromUrl(url){
  const clean=String(url||'').split(/[?#]/,1)[0].toLowerCase();
  if(clean.endsWith('.png'))return'image/png';
  if(clean.endsWith('.webp'))return'image/webp';
  if(clean.endsWith('.gif'))return'image/gif';
  if(clean.endsWith('.jpeg')||clean.endsWith('.jpg'))return'image/jpeg';
  return'image/jpeg';
}

function audioMimeFromUrl(url){
  const clean=String(url||'').split(/[?#]/,1)[0].toLowerCase();
  if(clean.endsWith('.mp3'))return'audio/mpeg';
  if(clean.endsWith('.ogg'))return'audio/ogg';
  if(clean.endsWith('.webm'))return'audio/webm';
  if(clean.endsWith('.wav'))return'audio/wav';
  if(clean.endsWith('.aac'))return'audio/aac';
  return'audio/mp4';
}

function normalizePhoto(content){
  const data=objectValue(content);
  if(!data)return null;
  const params=paramsValue(data);
  const sourceUrl=String(data.href||data.hdUrl||data.normalUrl||data.oriUrl||data.rawUrl||data.url||'').trim();
  if(!/^https?:\/\//i.test(sourceUrl))return null;
  return{
    text:String(data.description||data.desc||data.caption||'').trim(),
    media:{
      kind:'image',
      sourceUrl,
      thumbUrl:String(data.thumb||data.thumbUrl||'').trim()||null,
      fileName:null,
      mimeType:String(data.mimeType||data.contentType||'').split(';',1)[0].trim().toLowerCase()||imageMimeFromUrl(sourceUrl),
      sizeBytes:numberOrNull(params.hdSize,params.totalSize,data.hdSize,data.totalSize,data.size)||0,
      widthPx:numberOrNull(params.width,data.width),
      heightPx:numberOrNull(params.height,data.height),
    }
  };
}

function normalizeVoice(content){
  const data=objectValue(content);
  if(!data)return null;
  const params=paramsValue(data);
  const sourceUrl=String(data.m4aUrl||data.voiceUrl||data.href||data.url||params.m4aUrl||params.voiceUrl||'').trim();
  if(!/^https?:\/\//i.test(sourceUrl))return null;
  return{
    text:String(data.description||data.desc||'').trim(),
    media:{
      kind:'audio',
      sourceUrl,
      thumbUrl:null,
      fileName:null,
      mimeType:String(data.mimeType||data.contentType||params.mimeType||'').split(';',1)[0].trim().toLowerCase()||audioMimeFromUrl(sourceUrl),
      sizeBytes:numberOrNull(data.fileSize,data.totalSize,data.size,params.fileSize,params.totalSize)||0,
      widthPx:null,
      heightPx:null,
    }
  };
}

function normalizeFile(content){
  const data=objectValue(content);
  if(!data)return null;
  const params=paramsValue(data);
  const sourceUrl=String(data.fileUrl||data.href||data.downloadUrl||data.url||params.fileUrl||'').trim();
  const fileName=String(data.title||data.fileName||data.name||params.fileName||'').trim();
  if(!/^https?:\/\//i.test(sourceUrl)||!fileName)return null;
  return{
    text:String(data.description||data.desc||'').trim(),
    media:{
      kind:'file',
      sourceUrl,
      thumbUrl:String(data.thumb||data.thumbUrl||'').trim()||null,
      fileName,
      mimeType:String(data.mimeType||data.contentType||params.mimeType||'application/octet-stream').split(';',1)[0].trim().toLowerCase()||'application/octet-stream',
      sizeBytes:numberOrNull(data.totalSize,data.fileSize,data.size,params.totalSize)||0,
      widthPx:null,
      heightPx:null,
    }
  };
}

function cleanContactField(value,maxLength=120){
  if(typeof value!=='string'&&typeof value!=='number')return '';
  return String(value).replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,maxLength);
}

function normalizeContactCard(content,{explicitType=false}={}){
  const data=objectValue(content);
  if(!data)return null;
  const params=paramsValue(data);
  const candidates=[data.contact,data.profile,data.user,data.card,params.contact,params.profile,params.user,params.card]
    .map(objectValue).filter(Boolean);
  const profiles=[...candidates,data,params];
  const pick=(keys)=>{
    for(const row of profiles){
      for(const key of keys){
        const field=cleanContactField(row?.[key]);
        if(field)return field;
      }
    }
    return '';
  };
  const name=pick(['displayName','display_name','dName','fullName','fullname','contactName','title','name']);
  const rawPhone=pick(['phoneNumber','phone_number','phone','mobile','phoneNum','contactPhone','number']);
  const description=pick(['description','desc','subtitle']);
  const phoneMatch=(rawPhone||description).match(/(?:\+?84|0)[\d .()-]{8,18}/);
  const phone=phoneMatch?phoneMatch[0].replace(/[^\d+]/g,'').slice(0,16):'';
  const uid=pick(['uid','userId','zaloId','zalo_id','recommUid','recommendUid','contactId']);
  const href=pick(['href','profileUrl','link','url']);
  const safeLink=/^https:\/\/(?:zalo\.me|chat\.zalo\.me|zaloapp\.com)(?:\/|$)/i.test(href)?href.slice(0,240):'';
  // chat.recommended can also carry missed-call events and unrelated cards.
  // Never mistake an arbitrary share event for a phone contact.
  if(!name||(!phone&&!uid&&!safeLink))return null;
  if(!explicitType&&!phone&&!uid)return null;
  const lines=['📇 Danh thiếp Zalo',name];
  if(phone)lines.push('Số điện thoại: '+phone);
  if(safeLink)lines.push(safeLink);
  return{text:lines.join('\n'),media:null};
}

function normalizeMissedCall(content){
  const data=objectValue(content);
  if(!data)return null;
  const action=String(data.action||'').trim().toLowerCase();
  if(!action.includes('misscall'))return null;
  return{text:'Cuộc gọi nhỡ',media:null};
}

export function normalizeIncomingMessage(message,{userThreadType=USER_THREAD_TYPE,groupThreadType=GROUP_THREAD_TYPE}={}){
  if(!message||![userThreadType,groupThreadType].includes(message.type)||message.isSelf)return null;
  const zaloId=String(message.threadId||'').trim();
  const messageId=String(message?.data?.msgId||message?.data?.cliMsgId||'').trim();
  if(!zaloId||!messageId)return null;

  const msgType=String(message?.data?.msgType||'').trim().toLowerCase();
  const content=message?.data?.content;
  let normalized=null;
  if(msgType==='chat.photo')normalized=normalizePhoto(content);
  else if(msgType==='chat.voice')normalized=normalizeVoice(content);
  else if(msgType==='share.file')normalized=normalizeFile(content);
  else if(msgType==='chat.recommended')normalized=normalizeMissedCall(content)||normalizeContactCard(content);
  else if(['share.contact','chat.contact','chat.card','share.profile','share.user'].includes(msgType)){
    normalized=normalizeContactCard(content,{explicitType:true});
  }
  else if(typeof content==='string'&&(!msgType||msgType==='webchat')){
    const text=content.trim();
    if(text)normalized={text,media:null};
  }
  if(!normalized)return null;

  const event={
    zaloId,
    messageId,
    text:String(normalized.text||''),
    eventAt:eventAtFromTs(message?.data?.ts),
  };
  if(normalized.media)event.media=[normalized.media];
  return event;
}

export function bindIncomingMessageListener({api,onMessage,logger=console,userThreadType=USER_THREAD_TYPE,groupThreadType=GROUP_THREAD_TYPE}){
  if(!api?.listener?.on||typeof onMessage!=='function')return ()=>{};
  const handler=async raw=>{
    const event=normalizeIncomingMessage(raw,{userThreadType,groupThreadType});
    if(!event)return;
    try{await onMessage(event);}
    catch(error){logger?.warn?.('[zalo-incoming] handler failed',String(error?.message||error));}
  };
  api.listener.on('message',handler);
  return ()=>{
    try{api.listener.off?.('message',handler);}catch{}
  };
}
