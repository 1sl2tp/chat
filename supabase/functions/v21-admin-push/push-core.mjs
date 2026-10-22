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
export function bankScanReasonLabel(raw){
  const reason=String(raw||'');
  if(/gemini_key_missing|gemini_http_(?:400|401|403)|api.key|permission_denied/i.test(reason))
    return 'Khóa/API Gemini không hợp lệ hoặc hết quyền · Cần Admin kiểm tra';
  if(/gemini_http_429/i.test(reason))
    return 'Gemini hết hạn mức · Đang chờ quét lại';
  if(/gemini_http_5\d\d|gemini_http_408|aborted|aborterror|failed to fetch|load failed|worker_interrupted/i.test(reason))
    return 'AI quét ảnh lỗi hoặc quá thời gian · Sẽ tự thử lại';
  if(/ai_scan_retry_exhausted|ai_scan_old_unresolved|ai_scan_queue_expired/i.test(reason))
    return 'AI vẫn chưa kết luận được ảnh · Cần Admin xử lý';
  if(/gemini_invalid_json/i.test(reason))
    return 'AI trả kết quả không đọc được · Sẽ thử lại';
  if(/amount_scan_/i.test(reason))
    return 'Không đọc được ảnh · Admin cần kiểm tra';
  return reason.slice(0,100)||'Ảnh cần đối soát thủ công';
}
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
  const scanProblem=/^(?:amount_scan_|ai_scan_)/i.test(String(row.reason||''));
  const title=kind==='matched'?'TAPHOA · Đối soát thành công'
    :kind==='bank_only'?'TAPHOA · Tiền về'
    :kind==='bill_waiting'?'TAPHOA · Có bill mới'
    :scanProblem?'TAPHOA · AI quét bill gặp lỗi'
    :'TAPHOA · Cần kiểm tra';
  const body=kind==='matched'
    ?person+' · '+money+' · Đã ghi thu chính xác'
    :kind==='bank_only'
    ?'+'+money+(time?' · '+time:'')+' · Chưa có bill, chưa ghi thu'
    :kind==='bill_waiting'
    ?person+' · '+money+' · Chờ Agribank xác nhận'
    :person+' · '+bankScanReasonLabel(row.reason)+' · Chưa ghi thu';
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

export function buildMissedChatCallPayload(row={}){
 const name=String(row.contact_name||'Khách hàng').trim().slice(0,70)||'Khách hàng';
 const id=String(row.source_id||'');
 return {
   kind:'missed_chat_call',notification_id:String(row.outbox_id||''),
   source_kind:String(row.source_kind||''),call_id:id,
   contact_id:String(row.contact_id||''),
   title:'TAPHOA · Cuộc gọi nhỡ',
   body:name+' vừa gọi trên TAPHOA Chat · Chạm để gọi lại',
   tag:'missed-chat-call:'+id,
   icon:'./icons/chat-notification-icon-192-v4.png'
 };
}
