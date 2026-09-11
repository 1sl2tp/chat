import {Buffer} from 'node:buffer';

const MAX_MEDIA_BYTES=15*1024*1024;

function baseMime(value){
  return String(value||'application/octet-stream').split(';',1)[0].trim().toLowerCase()||'application/octet-stream';
}

function extensionForMime(mimeType,fallback='bin'){
  const mime=baseMime(mimeType);
  const map={
    'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif',
    'audio/mp4':'m4a','audio/m4a':'m4a','audio/mpeg':'mp3','audio/ogg':'ogg','audio/webm':'webm','audio/wav':'wav','audio/x-wav':'wav','audio/aac':'aac',
    'application/pdf':'pdf','text/plain':'txt','text/csv':'csv',
    'application/zip':'zip','application/x-zip-compressed':'zip',
    'application/msword':'doc','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
    'application/vnd.ms-excel':'xls','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
    'application/vnd.ms-powerpoint':'ppt','application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx'
  };
  return map[mime]||fallback;
}

function positiveNumber(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?Math.round(n):null;
}

function declaredLength(response){
  return positiveNumber(response?.headers?.get?.('content-length'));
}

async function readResponseBuffer(response,maxBytes){
  const declared=declaredLength(response);
  if(declared&&declared>maxBytes)throw new Error('media_size_out_of_range');
  const arrayBuffer=await response.arrayBuffer();
  const data=Buffer.from(arrayBuffer);
  if(data.length<1)throw new Error('media_empty');
  if(data.length>maxBytes)throw new Error('media_size_out_of_range');
  return data;
}

function sessionHeaders(api,sourceUrl){
  const headers={referer:'https://chat.zalo.me/'};
  let context=null;
  try{context=api?.getContext?.()||null;}catch{}
  const userAgent=String(context?.userAgent||'').trim();
  if(userAgent)headers['user-agent']=userAgent;
  try{
    const cookie=String(context?.cookie?.getCookieStringSync?.(sourceUrl)||'').trim();
    if(cookie)headers.cookie=cookie;
  }catch{}
  return headers;
}

export async function downloadInboundMedia({api,fetchImpl=fetch,media,maxBytes=MAX_MEDIA_BYTES}={}){
  const sourceUrl=String(media?.sourceUrl||'').trim();
  const kind=String(media?.kind||'').toLowerCase();
  if(!/^https?:\/\//i.test(sourceUrl)||!['image','audio','file'].includes(kind))throw new Error('invalid_media_source');

  const response=await fetchImpl(sourceUrl,{
    method:'GET',
    headers:sessionHeaders(api,sourceUrl),
    redirect:'follow',
  });
  if(!response?.ok)throw new Error(`zalo_media_http_${Number(response?.status)||0}`);
  const data=await readResponseBuffer(response,maxBytes);
  const responseMime=baseMime(response?.headers?.get?.('content-type')||media?.mimeType);
  let mimeType=responseMime;
  if(responseMime==='application/octet-stream'){
    if(kind==='image')mimeType=baseMime(media?.mimeType||'image/jpeg');
    if(kind==='audio')mimeType=baseMime(media?.mimeType||'audio/mp4');
  }
  if(kind==='image'&&!mimeType.startsWith('image/'))throw new Error('image_type_required');
  if(kind==='audio'&&!mimeType.startsWith('audio/'))throw new Error('audio_type_required');
  if(kind==='file'&&(mimeType.startsWith('image/')||mimeType.startsWith('audio/')))throw new Error('file_type_required');

  let filename=String(media?.fileName||'').trim();
  if(!filename){
    const fallback=kind==='image'?'jpg':kind==='audio'?'m4a':'bin';
    const ext=extensionForMime(mimeType,fallback);
    filename=kind==='image'?`zalo-image.${ext}`:kind==='audio'?`zalo-audio.${ext}`:`zalo-file.${ext}`;
  }
  return{
    data,
    filename,
    mimeType,
    sizeBytes:data.length,
    widthPx:kind==='image'?positiveNumber(media?.widthPx):null,
    heightPx:kind==='image'?positiveNumber(media?.heightPx):null,
  };
}

async function downloadSignedAsset(asset,index,{fetchImpl,maxBytes}){
  const signedUrl=String(asset?.signedUrl||'').trim();
  if(!/^https?:\/\//i.test(signedUrl))throw new Error('invalid_signed_media_url');
  const kind=String(asset?.kind||'file').toLowerCase();
  if(kind==='audio')throw new Error('audio_requires_send_voice');
  const response=await fetchImpl(signedUrl,{method:'GET',redirect:'follow'});
  if(!response?.ok)throw new Error(`chat_media_http_${Number(response?.status)||0}`);
  const data=await readResponseBuffer(response,maxBytes);
  const responseMime=baseMime(response?.headers?.get?.('content-type')||asset?.mimeType);
  const mimeType=responseMime==='application/octet-stream'?baseMime(asset?.mimeType):responseMime;
  if(kind==='image'&&!mimeType.startsWith('image/'))throw new Error('image_type_required');
  if(kind==='file'&&(mimeType.startsWith('image/')||mimeType.startsWith('audio/')))throw new Error('file_type_required');

  const ext=extensionForMime(mimeType,kind==='image'?'jpg':'bin');
  const filename=kind==='file'
    ?String(asset?.fileName||'').trim()||`file-${index+1}.${ext}`
    :String(asset?.fileName||'').trim()||`image-${index+1}.${ext}`;
  const metadata={totalSize:data.length};
  if(kind==='image'){
    const width=positiveNumber(asset?.widthPx);
    const height=positiveNumber(asset?.heightPx);
    if(width)metadata.width=width;
    if(height)metadata.height=height;
  }
  return{data,filename,metadata};
}

export async function buildOutboundMessage(row,{fetchImpl=fetch,maxBytes=MAX_MEDIA_BYTES}={}){
  const text=String(row?.text||'');
  const media=(Array.isArray(row?.media)?row.media:[])
    .filter(Boolean)
    .sort((a,b)=>(Number(a?.sortIndex)||0)-(Number(b?.sortIndex)||0));
  const attachments=[];
  for(const [index,asset] of media.entries()){
    attachments.push(await downloadSignedAsset(asset,index,{fetchImpl,maxBytes}));
  }
  if(!text&&!attachments.length)throw new Error('empty_outbound_message');
  return attachments.length?{msg:text,attachments}:{msg:text};
}
