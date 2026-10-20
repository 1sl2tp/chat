export function summarizeNotification({body='',media=[]}={}){
  const text=String(body||'').trim().replace(/\s+/g,' ');
  if(text)return text.slice(0,140);
  const first=Array.isArray(media)?media[0]:null;
  if(first?.kind==='image')return 'Ảnh';
  if(first?.kind==='audio')return 'Ghi âm';
  if(first?.kind==='file')return String(first.file_name||'Tệp').slice(0,80);
  return 'Tin nhắn mới';
}

export const isGoneStatus=status=>Number(status)===404||Number(status)===410;

export function retryDelaySeconds(attempt){
  return Math.min(300,10*(2**Math.max(0,Number(attempt||1)-1)));
}

export function buildNotificationPayload(row={}){
  return {
    kind:'message',
    notification_id:String(row.outbox_id??''),
    message_id:String(row.message_id??''),
    conversation_id:String(row.conversation_id??''),
    contact_id:String(row.sender_account_id??''),
    title:String(row.sender_display_name||row.sender_username||'Tin nhắn mới'),
    body:summarizeNotification({body:row.body,media:row.media}),
    tag:`chat:${String(row.conversation_id??'')}`,
    icon:'./icons/chat-notification-icon-192-v4.png'
  };
}

export function buildCallInviteNotificationPayload(row={}){
  const inviteId=String(row.invite_id??'');
  const contactId=String(row.contact_id??'');
  const name=String(row.contact_display_name||row.contact_username||'Khách hàng').trim()||'Khách hàng';
  return {
    kind:'call_invite',
    notification_id:String(row.outbox_id??''),
    invite_id:inviteId,
    message_id:'',
    conversation_id:'',
    contact_id:contactId,
    title:`Cuộc gọi đến · ${name}`,
    body:'Nhấn để mở Chat và nghe',
    tag:`call-invite:${inviteId}`,
    icon:'./icons/chat-notification-icon-192-v4.png'
  };
}

/* BANK-181: transactional reconciliation events, not Chat message bubbles.
   Stable tags replace stale credit/awaiting states when the match arrives. */
export function buildBankNotificationPayload(row={}){
  const kind=String(row.kind||'');
  const amount=Number(row.amount_vnd||0);
  const money=Number.isFinite(amount)&&amount>=0
    ?new Intl.NumberFormat('vi-VN').format(amount)+'đ':'Chưa rõ số tiền';
  const person=String(row.customer_name||'Khách hàng').trim().slice(0,64)||'Khách hàng';
  const time=String(row.transfer_time||'').slice(0,5);
  const date=String(row.business_date||'');
  const bankId=String(row.notification_id||'');
  const receiptId=String(row.receipt_id||'');
  const title=kind==='matched'?'TAPHOA · Đối soát thành công'
    :kind==='bank_only'?'TAPHOA · Tiền về'
    :kind==='bill_waiting'?'TAPHOA · Có bill mới'
    :'TAPHOA · Cần kiểm tra';
  const body=kind==='matched'
    ?person+' · '+money+' · Đã ghi thu chính xác'
    :kind==='bank_only'
    ?'+'+money+(time?' · '+time:'')+' · Chưa có bill, chưa ghi thu'
    :kind==='bill_waiting'
    ?person+' · '+money+' · Chờ Agribank xác nhận'
    :person+' · '+(String(row.reason||'Bill cần tra soát').trim().slice(0,60))+' · Chưa ghi thu';
  return {
    kind:'bank_reconciliation',
    notification_id:String(row.outbox_id||''),
    bank_event_kind:kind,
    bank_day:date,
    bank_notice_id:bankId,
    bank_receipt_id:receiptId,
    conversation_id:'',
    contact_id:String(row.report_contact_id||''),
    title,body,
    tag:bankId?'bank:notice:'+bankId:receiptId?'bank:receipt:'+receiptId:'bank:review:'+String(row.outbox_id||''),
    icon:'./icons/chat-notification-icon-192-v4.png'
  };
}
