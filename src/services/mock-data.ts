import type { ChatMessage } from '../app/types.js';

function demoImage(label: string, start: string, end: string, width = 800, height = 520): string {
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs><rect width="100%" height="100%" rx="24" fill="url(#g)"/><text x="50%" y="50%" fill="white" font-family="sans-serif" font-size="42" text-anchor="middle">${label}</text></svg>`);
}

const imgWide = demoImage('Ảnh ngang', '#1e3a8a', '#0ea5e9', 900, 520);
const imgSquare = demoImage('Ảnh vuông', '#334155', '#0f766e', 640, 640);
const imgPortrait = demoImage('Ảnh dọc', '#4c1d95', '#be185d', 520, 820);
const img4 = demoImage('Ảnh 4', '#7c2d12', '#c2410c', 640, 640);
const img5 = demoImage('Ảnh 5', '#164e63', '#0284c7', 640, 640);

export function mockConversation(peerName: string, localParticipantId = 'admin', peerParticipantId = 'c1'): ChatMessage[] {
  const incoming = (id: string, kind: ChatMessage['kind'], rest: Omit<ChatMessage, 'id' | 'kind' | 'senderId' | 'recipientId' | 'time'> & { time: string }): ChatMessage => ({ id, kind, senderId: peerParticipantId, recipientId: localParticipantId, ...rest });
  const outgoing = (id: string, kind: ChatMessage['kind'], rest: Omit<ChatMessage, 'id' | 'kind' | 'senderId' | 'recipientId' | 'time'> & { time: string }): ChatMessage => ({ id, kind, senderId: localParticipantId, recipientId: peerParticipantId, ...rest });

  return [
    incoming('m-text-in', 'text', { text: 'Chào bạn, mình muốn hỏi thêm thông tin.', time: '09:31' }),
    outgoing('m-reply', 'text', { replyTo: 'Chào bạn, mình muốn hỏi thêm thông tin.', text: `Chào ${peerName}, mình hỗ trợ ngay nhé.`, time: '09:32' }),
    incoming('m-link', 'text', { text: 'Bạn xem giúp mình ở https://taphoa.xyz nhé', time: '09:32' }),
    outgoing('m-file-pdf', 'file', { fileName: 'Bang-gia-thang-09.pdf', time: '09:33' }),
    outgoing('m-file-xlsx', 'file', { fileName: 'Don-hang-03-09.xlsx', time: '09:33' }),
    incoming('m-file-docx', 'file', { fileName: 'Bao-gia-khach-si.docx', time: '09:34' }),
    incoming('m-file-long', 'file', { fileName: 'Bao-gia-san-pham-thang-09-phien-ban-chinh-thuc-rat-dai.pdf', time: '09:34' }),
    incoming('m-audio', 'audio', { audioDuration: 18, time: '09:35' }),
    incoming('m-img-1', 'image', { images: [imgWide], text: 'Một ảnh kèm nội dung', time: '09:35' }),
    outgoing('m-img-2', 'image', { images: [imgWide, imgSquare], text: 'Hai ảnh trong cùng một tin', time: '09:35' }),
    incoming('m-img-3', 'image', { images: [imgWide, imgSquare, imgPortrait], text: 'Ba ảnh: một lớn và hai nhỏ', time: '09:36' }),
    outgoing('m-img-5', 'image', { images: [imgWide, imgSquare, imgPortrait, img4, img5], text: 'Album nhiều ảnh có +N', time: '09:36' }),
    { id: 'm-call-out', kind: 'call', senderId: localParticipantId, recipientId: peerParticipantId, time: '09:37', call: { callerId: localParticipantId, calleeId: peerParticipantId, outcome: 'completed', durationSeconds: 102 } },
    { id: 'm-call-missed', kind: 'call', senderId: peerParticipantId, recipientId: localParticipantId, time: '09:37', call: { callerId: peerParticipantId, calleeId: localParticipantId, outcome: 'unanswered' } },
    { id: 'm-system', kind: 'system', senderId: 'system', recipientId: null, text: 'Đã đồng bộ nội dung cuộc trò chuyện', time: '09:37' },
    outgoing('m-latest', 'text', { text: 'Mình đã nhận được. Cảm ơn bạn.', time: '09:38', status: 'seen' })
  ];
}
