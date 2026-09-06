(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.ChatConversationCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const MESSAGE_KINDS=Object.freeze(['text','image','file','audio','mixed']);

  function deriveMessageKind({text='',media=null}={}){
    const hasText=String(text??'').trim().length>0;
    if(!media)return 'text';
    const mediaKind=
      media.type==='image'||media.type==='gallery'||media.kind==='image'||media.kind==='image-gallery'
        ?'image'
        :media.kind==='audio'||media.type==='audio'
          ?'audio'
          :'file';
    return hasText?'mixed':mediaKind;
  }

  function createMessage(input={}){
    const media=input.media||null;
    const createdAt=Number(input.createdAt ?? Date.now());
    const rawReply=input.replyTo||null;
    const replyTo=
      rawReply && (rawReply.id || rawReply.messageId)
        ?{
            id:String(rawReply.id ?? rawReply.messageId),
            text:String(rawReply.text ?? ''),
            sender:rawReply.sender==='self'?'self':'remote'
          }
        :null;

    return {
      id:String(input.id ?? `m-${createdAt}-${Math.random().toString(36).slice(2)}`),
      clientId:input.clientId ? String(input.clientId) : null,
      text:String(input.text ?? ''),
      kind:MESSAGE_KINDS.includes(input.kind)?input.kind:deriveMessageKind({text:input.text,media}),
      sender:input.sender==='self'?'self':'remote',
      createdAt,
      status:input.status || (input.sender==='self'?'sent':'received'),
      media,
      important:Boolean(input.important),
      replyTo,
      cached:Boolean(input.cached),
    };
  }

  class MessageStore{
    constructor(){
      this.items=[];
      this.byId=new Map();
      this.byClientId=new Map();
    }

    get size(){ return this.items.length; }

    clear(){
      this.items.length=0;
      this.byId.clear();
      this.byClientId.clear();
      return this.items;
    }

    indexOfId(id){
      return this.items.findIndex(m=>m.id===id);
    }

    getById(id){ return this.byId.get(id)||null; }

    removeById(id){
      const key=String(id);
      if(!this.byId.has(key))return false;
      this.items=this.items.filter(m=>m.id!==key);
      this._reindex();
      return true;
    }

    _reindex(){
      this.byId.clear();
      this.byClientId.clear();
      for(const m of this.items){
        this.byId.set(m.id,m);
        if(m.clientId) this.byClientId.set(m.clientId,m);
      }
    }

    _merge(existing,incoming){
      const oldId=existing.id;
      Object.assign(existing,incoming);
      if(oldId!==incoming.id && incoming.id){
        existing.id=incoming.id;
      }
      return existing;
    }

    appendBatch(messages){
      for(const raw of messages){
        const incoming=createMessage(raw);
        const existing=
          this.byId.get(incoming.id) ||
          (incoming.clientId ? this.byClientId.get(incoming.clientId) : null);

        if(existing){
          this._merge(existing,incoming);
          continue;
        }

        this.items.push(incoming);
        this.byId.set(incoming.id,incoming);
        if(incoming.clientId) this.byClientId.set(incoming.clientId,incoming);
      }

      this.items.sort((a,b)=>
        a.createdAt-b.createdAt ||
        a.id.localeCompare(b.id)
      );
      this._reindex();
      return this.items;
    }

    prependBatch(messages){
      return this.appendBatch(messages);
    }

    latest(limit=40){
      return this.items.slice(Math.max(0,this.items.length-limit));
    }
  }

  const VIEWPORT_STATES=Object.freeze({
    FOLLOW_TAIL:'FOLLOW_TAIL',
    USER_AWAY:'USER_AWAY',
    RESTORING_HISTORY:'RESTORING_HISTORY'
  });

  class ConversationViewportModel{
    constructor(){
      this.mode=VIEWPORT_STATES.FOLLOW_TAIL;
      this.unseenCount=0;
      this.firstUnseenMessageId=null;
      this.tailRearmPx=24;
      this._beforeRestore=VIEWPORT_STATES.FOLLOW_TAIL;
    }

    setMode(mode){
      const allowed=Object.values(VIEWPORT_STATES);
      if(!allowed.includes(mode)){
        throw new Error(`Invalid viewport mode: ${mode}`);
      }
      this.mode=mode;
      return this.mode;
    }

    onUserScroll({distanceFromTail}={}){
      const d=Math.max(0,Number(distanceFromTail)||0);
      if(d<=this.tailRearmPx){
        this.mode=VIEWPORT_STATES.FOLLOW_TAIL;
        this.clearUnseen();
      }else{
        this.mode=VIEWPORT_STATES.USER_AWAY;
      }
      return this.mode;
    }

    beginHistoryRestore(){
      if(this.mode!==VIEWPORT_STATES.RESTORING_HISTORY){
        this._beforeRestore=this.mode;
      }
      this.mode=VIEWPORT_STATES.RESTORING_HISTORY;
      return this.mode;
    }

    finishHistoryRestore(){
      this.mode=this._beforeRestore===VIEWPORT_STATES.FOLLOW_TAIL
        ?VIEWPORT_STATES.FOLLOW_TAIL
        :VIEWPORT_STATES.USER_AWAY;
      return this.mode;
    }

    registerUnseen(ids){
      const clean=(ids||[]).filter(Boolean).map(String);
      if(!clean.length)return;
      if(!this.firstUnseenMessageId){
        this.firstUnseenMessageId=clean[0];
      }
      this.unseenCount+=clean.length;
    }

    clearUnseen(){
      this.unseenCount=0;
      this.firstUnseenMessageId=null;
    }

    captureState(){
      const mode=this.mode===VIEWPORT_STATES.RESTORING_HISTORY
        ?VIEWPORT_STATES.USER_AWAY
        :this.mode;
      return{
        mode,
        unseenCount:Math.max(0,Number(this.unseenCount)||0),
        firstUnseenMessageId:this.firstUnseenMessageId?String(this.firstUnseenMessageId):null
      };
    }

    restoreState(state={}){
      const mode=state?.mode===VIEWPORT_STATES.USER_AWAY
        ?VIEWPORT_STATES.USER_AWAY
        :VIEWPORT_STATES.FOLLOW_TAIL;
      this.mode=mode;
      this._beforeRestore=mode;
      if(mode===VIEWPORT_STATES.FOLLOW_TAIL){
        this.clearUnseen();
        return this.captureState();
      }
      this.unseenCount=Math.max(0,Number(state?.unseenCount)||0);
      this.firstUnseenMessageId=this.unseenCount>0&&state?.firstUnseenMessageId
        ?String(state.firstUnseenMessageId)
        :null;
      return this.captureState();
    }

    returnToTail(){
      this.mode=VIEWPORT_STATES.FOLLOW_TAIL;
      this._beforeRestore=VIEWPORT_STATES.FOLLOW_TAIL;
      this.clearUnseen();
      return this.mode;
    }
  }

  function estimateTextLines(text,widthPx){
    const charsPerLine=Math.max(8,Math.floor((Number(widthPx)||320)/8.2));
    const logical=String(text||'').split('\n');
    let lines=0;
    for(const part of logical){
      lines+=Math.max(1,Math.ceil(part.length/charsPerLine));
    }
    return lines;
  }

  function normalizedImageRatio(media){
    const raw=
      Number(media?.aspectRatio) ||
      (
        Number(media?.width)>0 && Number(media?.height)>0
          ?Number(media.width)/Number(media.height)
          :1.5
      );
    return Math.max(.22,Math.min(4.5,raw||1.5));
  }

  function estimateMessageHeight(message,widthPx=320){
    // widthPx is the INNER shared chat-content axis, not ScrollRoot width.
    // Message units are capped to 70% of that axis by the renderer.
    const width=Math.max(180,Number(widthPx)||320);
    const laneWidth=Math.max(126,Math.min(width*.70,520));
    const hasText=Boolean(String(message?.text||'').length||message?.replyTo);
    const textLines=hasText?estimateTextLines(message?.text||'',Math.max(94,laneWidth-32)):0;

    // Outer turn spacing is already part of the rendered turn (pt-3 / pb-8).
    // Keep the estimate close to DOM height so virtual spacers do not shrink
    // when a row becomes materialized.
    let height=hasText?Math.max(44,20+textLines*24):0;
    if(message?.replyTo)height+=34;

    const media=message?.media||null;
    if(media){
      const mediaGap=hasText?8:0;
      if(media.type==='image'){
        const ratio=normalizedImageRatio(media);
        const desired=Math.max(150,Math.min(360,ratio*420));
        const mediaWidth=Math.min(laneWidth,desired);
        height+=mediaGap+Math.round(mediaWidth/ratio);
      }else if(media.type==='gallery'){
        const count=Math.max(1,Array.isArray(media.items)?media.items.length:1);
        const galleryRatio=count===2?1.7:count===3?1.32:1.2;
        const mediaWidth=Math.min(laneWidth,360);
        height+=mediaGap+Math.round(mediaWidth/galleryRatio);
      }else if(media.type==='file'){
        height+=mediaGap+(media.kind==='audio'?52:58);
      }else if(media.type==='audio'){
        height+=mediaGap+52;
      }
    }

    // Self turns own 12px top spacing; remote turns own 8px bottom spacing.
    // 12px is a safe common estimate and avoids the old +16 cache inflation.
    return Math.max(40,Math.ceil(height+12));
  }

  class DataWindowModel{
    constructor({maxDomMessages=120,overscan=20}={}){
      this.maxDomMessages=Math.max(20,Number(maxDomMessages)||120);
      this.overscan=Math.max(0,Number(overscan)||20);
    }

    compute({messages,anchorIndex=null,tailMode=false}){
      const list=Array.isArray(messages)?messages:[];
      const n=list.length;
      if(n<=this.maxDomMessages){
        return{start:0,end:n,items:list.slice()};
      }

      let start;
      let end;

      if(tailMode || anchorIndex===null || !Number.isFinite(Number(anchorIndex))){
        end=n;
        start=Math.max(0,end-this.maxDomMessages);
      }else{
        const anchor=Math.max(0,Math.min(n-1,Number(anchorIndex)));
        const before=Math.min(
          anchor,
          Math.floor(this.maxDomMessages*0.45)+this.overscan
        );
        start=Math.max(0,anchor-before);
        end=Math.min(n,start+this.maxDomMessages);
        start=Math.max(0,end-this.maxDomMessages);
      }

      return{
        start,
        end,
        items:list.slice(start,end)
      };
    }

    estimateSpacer(messages,start,end,widthPx,heightCache){
      let total=0;
      for(let i=start;i<end;i++){
        const m=messages[i];
        const cached=heightCache && heightCache.get(m.id);
        total+=Number(cached)||estimateMessageHeight(m,widthPx);
      }
      return Math.max(0,Math.round(total));
    }

    indexAtOffset(messages,offsetPx,widthPx,heightCache){
      const list=Array.isArray(messages)?messages:[];
      if(!list.length)return 0;

      let remaining=Math.max(0,Number(offsetPx)||0);

      for(let i=0;i<list.length;i++){
        const message=list[i];
        const cached=
          heightCache &&
          heightCache.get(message.id);

        const h=
          Number(cached) ||
          estimateMessageHeight(
            message,
            widthPx
          );

        if(remaining<h){
          return i;
        }

        remaining-=h;
      }

      return list.length-1;
    }
  }

  class HistoryLoader{
    constructor({thresholdPx=400,fetchOlder}={}){
      this.thresholdPx=Math.max(0,Number(thresholdPx)||400);
      this.fetchOlder=fetchOlder || (async()=>({messages:[],nextCursor:null}));
      this.pendingByCursor=new Map();
    }

    maybeLoadOlder({distanceToTop,cursor}={}){
      if(cursor===null || cursor===undefined){
        return Promise.resolve({messages:[],nextCursor:null,skipped:true});
      }

      if(Number(distanceToTop)>this.thresholdPx){
        return Promise.resolve({messages:[],nextCursor:cursor,skipped:true});
      }

      const key=String(cursor);
      if(this.pendingByCursor.has(key)){
        return this.pendingByCursor.get(key);
      }

      const promise=Promise.resolve()
        .then(()=>this.fetchOlder(cursor))
        .finally(()=>this.pendingByCursor.delete(key));

      this.pendingByCursor.set(key,promise);
      return promise;
    }
  }

  return{
    MESSAGE_KINDS,
    VIEWPORT_STATES,
    deriveMessageKind,
    createMessage,
    MessageStore,
    ConversationViewportModel,
    DataWindowModel,
    HistoryLoader,
    estimateMessageHeight
  };
});
