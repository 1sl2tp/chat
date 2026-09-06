(()=>{
'use strict';
const icons=Object.freeze({
  reply:Object.freeze({
    source:'p2p-product',
    markup:`<svg xmlns="http://www.w3.org/2000/svg" class="p2p-reply-icon" width="20" height="20" viewBox="0 0 20 20" focusable="false" aria-hidden="true"><path d="M8.25 5.25 3.75 9.75l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"></path><path d="M4.25 9.75h6.1c3.65 0 5.9 1.85 5.9 5" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path></svg>`
  }),
  important:Object.freeze({
    source:'p2p-product',
    markup:`<svg xmlns="http://www.w3.org/2000/svg" class="p2p-important-icon" width="20" height="20" viewBox="0 0 20 20" focusable="false" aria-hidden="true"><path d="m10 2.85 2.08 4.22 4.66.68-3.37 3.28.8 4.64L10 13.48l-4.17 2.19.8-4.64-3.37-3.28 4.66-.68L10 2.85Z" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"></path></svg>`
  }),
  close:Object.freeze({
    source:'p2p-product',
    markup:`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" focusable="false" aria-hidden="true"><path d="m5.5 5.5 9 9m0-9-9 9" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path></svg>`
  })
});
function getIcon(name){return icons[name]||null}
function iconMarkup(name){return getIcon(name)?.markup||''}
window.P2PVisualReference=Object.freeze({icons,getIcon,iconMarkup});
})();
