(()=>{
'use strict';

function escAttr(value){
  return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const CUSTOM=Object.freeze({
  forward:Object.freeze({viewBox:'0 0 20 20',stroke:1.55,body:'<path d="M11.75 5.25 16.25 9.75l-4.5 4.5"></path><path d="M15.75 9.75h-6.1c-3.65 0-5.9 1.85-5.9 5"></path>'}),
  save:Object.freeze({viewBox:'0 0 20 20',stroke:1.55,body:'<path d="M10 2.75v9.1"></path><path d="m6.8 8.8 3.2 3.2 3.2-3.2"></path><path d="M4 13.25v1.15A2.6 2.6 0 0 0 6.6 17h6.8a2.6 2.6 0 0 0 2.6-2.6v-1.15"></path>'}),
  close:Object.freeze({viewBox:'0 0 24 24',stroke:2,body:'<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"></path>'}),
  'chevron-left':Object.freeze({viewBox:'0 0 24 24',stroke:2.1,body:'<path d="m14.5 6-6 6 6 6"></path>'}),
  'chevron-right':Object.freeze({viewBox:'0 0 24 24',stroke:2.1,body:'<path d="m9.5 6 6 6-6 6"></path>'}),
  quote:Object.freeze({viewBox:'0 0 24 24',stroke:1.6,body:'<path d="M5 4h14v16H5z"></path><path d="M8 8h8M8 12h8M8 16h5"></path>'}),
  call:Object.freeze({viewBox:'0 0 24 24',stroke:1.6,body:'<path d="M7.2 4.5 10 8l-1.8 2.2c1.2 2.5 3.1 4.4 5.6 5.6L16 14l3.5 2.8-.9 2.7c-.3.8-1.1 1.3-2 1.2C9.4 19.8 4.2 14.6 3.3 7.4c-.1-.9.4-1.7 1.2-2l2.7-.9Z"></path>'}),
  key:Object.freeze({viewBox:'0 0 24 24',stroke:1.7,body:'<circle cx="8.5" cy="12" r="3.5"></circle><path d="M12 12h8M17 12v3M20 12v2"></path>'})
});

function customMarkup(name,{size=20}={}){
  const spec=CUSTOM[name];
  if(!spec)return '';
  const px=Math.max(12,Math.min(32,Number(size)||20));
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+escAttr(px)+'" height="'+escAttr(px)+'" viewBox="'+escAttr(spec.viewBox)+'" focusable="false" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="'+escAttr(spec.stroke)+'" stroke-linecap="round" stroke-linejoin="round">'+spec.body+'</svg>';
}

function markup(name,options={}){
  const key=String(name||'');
  const size=Number(options.size)||20;
  const chatgpt=window.ChatGPTVisualReference;
  const p2p=window.P2PVisualReference;
  if(key==='copy')return chatgpt?.iconMarkup?.('copy-user',{width:size,height:size})||'';
  if(key==='share')return chatgpt?.iconMarkup?.('share',{width:size,height:size})||'';
  if(key==='reply'||key==='important')return p2p?.iconMarkup?.(key)||'';
  return customMarkup(key,{size});
}

function node(name,options={}){
  const html=markup(name,options);
  if(!html)return null;
  const holder=document.createElement('span');
  holder.innerHTML=html;
  return holder.firstElementChild;
}

window.V21Icons=Object.freeze({markup,node});
})();
