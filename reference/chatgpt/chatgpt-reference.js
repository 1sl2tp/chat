(()=>{
'use strict';

const DATA={"sourceSha256":"7e230ebff594182aaa34554dc3050e8be8578db9245bf0c92bba1ae781beccd1","stylesheets":["./ChatGPT_files/root-fvw472o7.css","./ChatGPT_files/conversation-small-rs0bfdsz.css","./ChatGPT_files/conversation-small-rs0bfdsz(1).css","./ChatGPT_files/global-modals-dgfy4wm4.css","./ChatGPT_files/react-ky4jdgh1.css","./ChatGPT_files/writing-block-provider-m3sk80p7.css","./ChatGPT_files/ansi-1f6vhsjh.css","./ChatGPT_files/app-block-trigger-actions-hxl87txx.css","./ChatGPT_files/code-block-dop2czwo.css","./ChatGPT_files/writing-block-gwgymy54.css","./ChatGPT_files/client-defined-widget-gdqdmhro.css","./ChatGPT_files/table-components-b39fqymt.css","./ChatGPT_files/lightbox-oq69ik3y.css","./ChatGPT_files/style","./ChatGPT_files/cot-message-chunk-b8hse3v2.css","./ChatGPT_files/cot-v5-cwqe3unp.css"],"spriteRefs":["/cdn/assets/sprites-shell-097001e7.svg#chevron-down-sm","/cdn/assets/sprites-shell-097001e7.svg#menu","/cdn/assets/sprites-shell-097001e7.svg#microphone-regular-24","/cdn/assets/sprites-shell-097001e7.svg#plus-regular-20","/cdn/assets/sprites-shell-097001e7.svg#voice-regular-24"],"icons":[{"index":0,"label":null,"testid":"open-sidebar-button","width":"20","height":"20","viewBox":"0 0 20 20","spriteHref":"/cdn/assets/sprites-shell-097001e7.svg#menu","paths":[],"name":"menu"},{"index":1,"label":"Trình chọn mô hình","testid":"model-switcher-dropdown-button","width":"16","height":"16","viewBox":"0 0 16 16","spriteHref":"/cdn/assets/sprites-shell-097001e7.svg#chevron-down-sm","paths":[],"name":"chevron-down-sm"},{"index":2,"label":"Sao chép tin nhắn","testid":"copy-turn-action-button","width":"20","height":"20","viewBox":"0 0 20 20","spriteHref":null,"paths":["M15.1006 1.78516C16.793 1.78556 18.165 3.15808 18.165 4.85059V10.8838C18.1649 12.5762 16.7929 13.9478 15.1006 13.9482H13.998V15.0508C13.9976 16.7431 12.626 18.1151 10.9336 18.1152H4.90039C3.20789 18.1152 1.83537 16.7432 1.83496 15.0508V9.01758C1.83496 7.32482 3.20764 5.95215 4.90039 5.95215H6.00195V4.85059C6.00195 3.15783 7.37463 1.78516 9.06738 1.78516H15.1006ZM4.90039 7.28223C3.94218 7.28223 3.16504 8.05936 3.16504 9.01758V15.0508C3.16544 16.0087 3.94243 16.7852 4.90039 16.7852H10.9336C11.8914 16.785 12.6676 16.0086 12.668 15.0508V9.01758C12.668 8.05945 11.8917 7.28237 10.9336 7.28223H4.90039ZM9.06738 3.11523C8.10917 3.11523 7.33203 3.89237 7.33203 4.85059V5.95215H10.9336C12.6262 5.95229 13.998 7.32491 13.998 9.01758V12.6182H15.1006C16.0584 12.6178 16.8348 11.8416 16.835 10.8838V4.85059C16.835 3.89262 16.0585 3.11564 15.1006 3.11523H9.06738Z"],"name":"copy-user"},{"index":3,"label":"Sao chép phản hồi","testid":"copy-turn-action-button","width":"20","height":"20","viewBox":"0 0 20 20","spriteHref":null,"paths":["M15.1006 1.78516C16.793 1.78556 18.165 3.15808 18.165 4.85059V10.8838C18.1649 12.5762 16.7929 13.9478 15.1006 13.9482H13.998V15.0508C13.9976 16.7431 12.626 18.1151 10.9336 18.1152H4.90039C3.20789 18.1152 1.83537 16.7432 1.83496 15.0508V9.01758C1.83496 7.32482 3.20764 5.95215 4.90039 5.95215H6.00195V4.85059C6.00195 3.15783 7.37463 1.78516 9.06738 1.78516H15.1006ZM4.90039 7.28223C3.94218 7.28223 3.16504 8.05936 3.16504 9.01758V15.0508C3.16544 16.0087 3.94243 16.7852 4.90039 16.7852H10.9336C11.8914 16.785 12.6676 16.0086 12.668 15.0508V9.01758C12.668 8.05945 11.8917 7.28237 10.9336 7.28223H4.90039ZM9.06738 3.11523C8.10917 3.11523 7.33203 3.89237 7.33203 4.85059V5.95215H10.9336C12.6262 5.95229 13.998 7.32491 13.998 9.01758V12.6182H15.1006C16.0584 12.6178 16.8348 11.8416 16.835 10.8838V4.85059C16.835 3.89262 16.0585 3.11564 15.1006 3.11523H9.06738Z"],"name":"copy-assistant"},{"index":4,"label":"Chia sẻ","testid":null,"width":"20","height":"20","viewBox":"0 0 20 20","spriteHref":null,"paths":["M16.6663 10.1681C17.0335 10.1681 17.3313 10.4659 17.3313 10.8332V14.1994C17.3313 15.929 15.929 17.3312 14.1995 17.3312H5.80005C4.07048 17.3312 2.66821 15.929 2.66821 14.1994V10.8332C2.66821 10.4659 2.96598 10.1681 3.33325 10.1681C3.70052 10.1681 3.99829 10.4659 3.99829 10.8332V14.1994C3.99829 15.1944 4.80502 16.0011 5.80005 16.0011H14.1995C15.1945 16.0011 16.0012 15.1944 16.0012 14.1994V10.8332C16.0012 10.466 16.2991 10.1683 16.6663 10.1681Z","M9.31763 3.08317C9.71412 2.76014 10.2865 2.75993 10.6829 3.08317L10.7649 3.15739L14.012 6.40446C14.2716 6.66406 14.2714 7.08517 14.012 7.34489C13.7523 7.60459 13.3312 7.60459 13.0715 7.34489L10.6653 4.93864V11.8752C10.6653 12.2423 10.3674 12.54 10.0002 12.5402C9.63297 12.5402 9.33521 12.2424 9.33521 11.8752V4.93669L6.92896 7.34489C6.66926 7.60459 6.24725 7.60459 5.98755 7.34489C5.72836 7.08521 5.72817 6.66402 5.98755 6.40446L9.23462 3.15739L9.31763 3.08317Z"],"name":"share"},{"index":5,"label":null,"testid":null,"width":"20","height":"20","viewBox":"0 0 20 20","spriteHref":null,"paths":["M10.0005 2.66797C10.3676 2.6681 10.6655 2.96582 10.6655 3.33301V15.0596L15.3628 10.3623C15.6223 10.1029 16.0435 10.1032 16.3032 10.3623C16.5629 10.622 16.5629 11.044 16.3032 11.3037L10.7651 16.8418C10.3427 17.264 9.65717 17.2641 9.23484 16.8418L3.69578 11.3037C3.43635 11.0441 3.43639 10.622 3.69578 10.3623C3.95541 10.1027 4.37747 10.1028 4.63718 10.3623L9.33542 15.0605V3.33301C9.33542 2.96574 9.63319 2.66797 10.0005 2.66797Z"],"name":"scroll-down"},{"index":6,"label":"Thêm tệp và nhiều nội dung khác","testid":"composer-plus-btn","width":"20","height":"20","viewBox":"0 0 20 20","spriteHref":"/cdn/assets/sprites-shell-097001e7.svg#plus-regular-20","paths":[],"name":"plus-regular-20"},{"index":7,"label":"Bắt đầu đọc chính tả","testid":null,"width":"24","height":"24","viewBox":"0 0 24 24","spriteHref":"/cdn/assets/sprites-shell-097001e7.svg#microphone-regular-24","paths":[],"name":"microphone-regular-24"},{"index":8,"label":"Dùng Giọng nói","testid":"composer-speech-button","width":"24","height":"24","viewBox":"0 0 24 24","spriteHref":"/cdn/assets/sprites-shell-097001e7.svg#voice-regular-24","paths":[],"name":"voice-regular-24"}],"componentClasses":{"user_turn":["text-token-text-primary","w-full","focus:outline-none","has-data-writing-block:pointer-events-none","[&:has([data-writing-block])>*]:pointer-events-auto","R6Vx5W_threadScrollVars","scroll-mb-[calc(var(--scroll-root-safe-area-inset-bottom,0px)+var(--thread-response-height))]","scroll-mt-(--sticky-padding-top)"],"assistant_turn":["text-token-text-primary","w-full","focus:outline-none","has-data-writing-block:pointer-events-none","[&:has([data-writing-block])>*]:pointer-events-auto","R6Vx5W_threadScrollVars","scroll-mb-[calc(var(--scroll-root-safe-area-inset-bottom,0px)+var(--thread-response-height))]","scroll-mt-[calc(var(--header-height)+min(200px,max(70px,20svh)))]"],"user_actions":["touch:-me-2","touch:-ms-3.5","-ms-2.5","-me-1","flex","flex-wrap","items-center","gap-y-4","p-1","select-none","focus-within:transition-none","hover:transition-none","touch:pointer-events-auto","touch:opacity-100","cant-hover:pointer-events-auto","cant-hover:opacity-100","duration-300","group-hover/turn-messages:delay-300","pointer-events-none","opacity-0","motion-safe:transition-opacity","group-hover/turn-messages:pointer-events-auto","group-hover/turn-messages:opacity-100","group-focus-within/turn-messages:pointer-events-auto","group-focus-within/turn-messages:opacity-100","has-data-[state=open]:pointer-events-auto","has-data-[state=open]:opacity-100"],"assistant_actions":["touch:-me-2","touch:-ms-3.5","-ms-2.5","-me-1","flex","flex-wrap","items-center","gap-y-4","p-1","select-none","touch:w-[calc(100%+--spacing(3.5))]","-mt-1","w-[calc(100%+--spacing(2.5))]","duration-[1.5s]","focus-within:transition-none","hover:transition-none","touch:pointer-events-auto","cant-hover:pointer-events-auto","pointer-events-none","[mask-image:linear-gradient(to_right,black_33%,transparent_66%)]","[mask-size:300%_100%]","[mask-position:100%_0%]","motion-safe:transition-[mask-position]","group-hover/turn-messages:pointer-events-auto","group-hover/turn-messages:[mask-position:0_0]","group-focus-within/turn-messages:pointer-events-auto","group-focus-within/turn-messages:[mask-position:0_0]","has-data-[state=open]:pointer-events-auto","has-data-[state=open]:[mask-position:0_0]"],"composer":["group/composer","w-full"],"thread_bottom_container":["sticky","bottom-0","z-10","isolate","group/thread-bottom-container","w-full","basis-auto","has-data-has-thread-error:pt-2","has-data-has-thread-error:[box-shadow:var(--sharp-edge-bottom-shadow)]","md:border-transparent","md:pt-0","dark:border-white/20","md:dark:border-transparent","print:hidden","pointer-events-none","[--thread-content-max-width:40rem]","@w-lg/main:[--thread-content-max-width:48rem]","Ejxyja_threadFooterContentFade","flex","flex-col"],"scroll_control_button":["relative","flex","h-8","w-8","cursor-pointer","items-center","justify-center","overflow-hidden","rounded-full","outline-hidden","select-none","btn-secondary","bg-token-bg-primary/65!","hover:bg-token-main-surface-secondary/75!","shadow-short","box-content","backdrop-blur-[2px]","backdrop-filter","sm:shadow-md","dark:shadow-none!","group-data-stream-active/scroll-root:squircle","*:absolute","*:inset-0","*:m-auto","group-data-stream-active/scroll-root:w-10","motion-safe:transition-[width]","motion-safe:duration-120","motion-safe:ease-out","*:motion-safe:transition-opacity","*:motion-safe:duration-120","*:motion-safe:ease-out","absolute","start-1/2","z-10","-translate-x-1/2","bottom-[calc(100%+1*var(--spacing)+var(--thread-scroll-to-bottom-banner-offset,0px))]"],"header":["draggable","no-draggable-children","sticky","top-0","p-2","touch:p-2.5","flex","items-center","justify-between","z-20","h-header-height","bg-transparent!","shadow-none!","pointer-events-none","select-none","[view-transition-name:var(--vt-page-header)]","*:pointer-events-auto","transition-none","motion-safe:transition-none","data-[fixed-header=less-than-xl]:@w-xl/main:bg-transparent","data-[fixed-header=less-than-xl]:@w-xl/main:shadow-none!"]},"selectedSignatures":{"user_bubble":["corner-superellipse/0.98","relative","min-w-0","overflow-hidden","rounded-[22px]","px-4","py-2.5","leading-6","user-message-bubble-color","max-w-(--user-chat-width,70%)"],"user_message_text":null,"user_action_button":["text-token-text-secondary","hover:bg-token-surface-hover","rounded-lg"],"assistant_message_root":["min-h-8","text-message","relative","flex","w-full","flex-col","items-end","gap-2","text-start","break-words","whitespace-normal","outline-none","keyboard-focused:focus-ring","[.text-message+&]:mt-1"],"assistant_action_button":["text-token-text-secondary","hover:bg-token-surface-hover","rounded-lg"],"composer_surface":["bg-(--composer-surface-primary)","grid","cursor-text","flex-col","overflow-clip","bg-clip-padding","contain-inline-size","motion-safe:transition-colors","motion-safe:duration-200","motion-safe:ease-in-out","group-not-data-expanded/composer:min-h-[52px]","grid-cols-[minmax(0,1fr)]","grid-rows-[max-content_0_auto]","[grid-template-areas:'eyebrow'_'controls'_'body']","shadow-short-composer","max-sm:not-dark:shadow-[0_0_0_1px_rgba(0,_0,_0,_0.04),0_2px_8px_0_rgba(0,_0,_0,_0.04),0px_4px_40px_8px_rgba(0,_0,_0,_0.025)]","border","border-token-border-heavy","shadow-elevation-01!"],"upload_input":{"accept":"image/gif,.gif,image/png,.png,image/jpeg,.jpg,.jpeg,.mpo,image/webp,.webp","multiple":true,"id":"upload-files","data-photo-upload-enabled":"true"}}};

const byName=new Map(
  DATA.icons.map(icon=>[icon.name,icon])
);

function getIcon(name){
  return byName.get(name)||null;
}

function getSpriteRef(name){
  return getIcon(name)?.spriteHref||null;
}

function getComponentClasses(name){
  const value=DATA.componentClasses?.[name];
  return Array.isArray(value)?[...value]:[];
}

function getSignature(name){
  const value=DATA.selectedSignatures?.[name];
  return Array.isArray(value)?[...value]:value||null;
}

function iconMarkup(name,options={}){
  const icon=getIcon(name);
  if(!icon)return '';

  const width=options.width||icon.width||20;
  const height=options.height||icon.height||20;
  const viewBox=icon.viewBox||`0 0 ${width} ${height}`;

  if(Array.isArray(icon.paths) && icon.paths.length){
    const paths=icon.paths.map((d,index)=>{
      const isCopy=
        name==='copy-user' ||
        name==='copy-assistant';

      return `<path${isCopy && index===0 ? ' fill-rule="evenodd" clip-rule="evenodd"' : ''} d="${d}" fill="currentColor"></path>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" focusable="false" aria-hidden="true">${paths}</svg>`;
  }

  if(icon.spriteHref){
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" focusable="false" aria-hidden="true"><use href="${icon.spriteHref}" fill="currentColor"></use></svg>`;
  }

  return '';
}

const API={
  ...DATA,
  getIcon,
  getSpriteRef,
  getComponentClasses,
  getSignature,
  iconMarkup
};

window.ChatGPTVisualReference=Object.freeze(API);
})();
