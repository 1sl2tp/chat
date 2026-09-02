import type { ChatMessage } from '../messages'
import { attachmentKindForMime, sanitizeAttachmentName, validateAttachmentFile, type ChatAttachment, type ChatAttachmentKind } from './types'

export interface AttachmentSendInput {
  conversationId: string
  clientMessageId: string
  type: ChatAttachmentKind
  attachment: ChatAttachment
}

export interface AttachmentTransport {
  upload(path: string, file: File): Promise<void>
  remove(path: string): Promise<void>
  send(input: AttachmentSendInput): Promise<ChatMessage>
}

export interface AttachmentSendContext {
  conversationId: string
  profileId: string
}

export function buildAttachmentPath(
  context: AttachmentSendContext,
  clientMessageId: string,
  fileName: string,
): string {
  const safeName = sanitizeAttachmentName(fileName)
  return `${context.conversationId}/${context.profileId}/${clientMessageId}-${safeName}`
}

export async function sendAttachmentFile(
  transport: AttachmentTransport,
  context: AttachmentSendContext,
  file: File,
  createId: () => string = () => crypto.randomUUID(),
): Promise<ChatMessage> {
  validateAttachmentFile(file)
  if (!context.conversationId || !context.profileId) throw new Error('attachment_context_required')

  const clientMessageId = createId()
  const kind = attachmentKindForMime(file.type)
  const path = buildAttachmentPath(context, clientMessageId, file.name)
  const attachment: ChatAttachment = {
    kind,
    path,
    name: sanitizeAttachmentName(file.name),
    mime: file.type || 'application/octet-stream',
    size: file.size,
  }

  await transport.upload(path, file)
  try {
    return await transport.send({
      conversationId: context.conversationId,
      clientMessageId,
      type: kind,
      attachment,
    })
  } catch (error) {
    try {
      await transport.remove(path)
    } catch {
      // Rollback cleanup is best-effort; preserve the original send failure.
    }
    throw error
  }
}
