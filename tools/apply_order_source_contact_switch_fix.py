from pathlib import Path

root=Path(__file__).resolve().parents[1]
path=root/'admin-order-source.js'
text=path.read_text(encoding='utf-8')
anchor="""document.addEventListener('v21-auth-state',event=>{
  if(event?.detail?.state!=='AUTHENTICATED'&&panel&&!panel.hidden)close();
});

window.V21AdminOrderSource=Object.freeze({open,close,refresh,context,markImported});
"""
insert="""document.addEventListener('v21-auth-state',event=>{
  if(event?.detail?.state!=='AUTHENTICATED'&&panel&&!panel.hidden)close();
});

document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  const row=target?.closest?.('[data-contact-row]');
  if(!row||!panel||panel.hidden)return;
  const before=String(currentContact()?.id||'');
  window.setTimeout(()=>{
    const after=String(currentContact()?.id||'');
    if(!after||after===before)return;
    requestSeq++;
    selectedIds.clear();
    rows=[];
    lastRange={from:'',to:''};
    void refresh();
  },0);
},true);

window.V21AdminOrderSource=Object.freeze({open,close,refresh,context,markImported});
"""
if '[data-contact-row]' not in text:
    if anchor not in text:
        raise SystemExit('contact switch anchor not found')
    text=text.replace(anchor,insert,1)
path.write_text(text,encoding='utf-8')
print('order source contact switch fix applied')
