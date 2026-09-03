import type { Store } from '../app/store.js';
import type { ChatMessage, Contact } from '../app/types.js';
import type { OverlayManager } from '../app/overlay-manager.js';
import { mockConversation } from '../services/mock-data.js';
import { createId, createUuid } from '../utils/id.js';
import { Composer, type ComposerPayload } from './composer.js';
import { LiveConversationSession, type ChatConversationSource } from './live-conversation.js';
import { MediaManager } from './media-manager.js';
import { MessageList } from './message-list.js';

export interface ChatScreenOptions {
  localParticipantId: string;
  conversationSource?: ChatConversationSource;
  onCallBack?: () => void;
  onError?: (error: Error) => void;
}

export class ChatScreen {
  #root: HTMLElement | null = null;
  #primary: HTMLElement | null = null;
  #mediaHost: HTMLElement | null = null;
  #list: MessageList | null = null;
  #composer: Composer | null = null;
  #media: MediaManager | null = null;
  #live: LiveConversationSession | null = null;
  #returnScrollTop = 0;

  constructor(
    private readonly store: Store,
    private readonly overlays: OverlayManager,
    readonly peer: Contact,
    private readonly options: ChatScreenOptions
  ) {}

  mount(): HTMLElement {
    const root = document.createElement('section');
    root.className = 'screen chat-screen';
    const primary = document.createElement('section');
    primary.className = 'chat-primary';
    const mediaHost = document.createElement('aside');
    mediaHost.className = 'chat-media-pane';
    mediaHost.hidden = true;

    const messages = this.options.conversationSource
      ? (this.store.state.messages[this.peer.id] ??= [])
      : (this.store.state.messages[this.peer.id] ??= mockConversation(this.peer.name, this.options.localParticipantId, this.peer.id));
    this.#list = new MessageList(this.overlays, this.options.localParticipantId, {
      onReply: (message) => this.#composer?.setReply(message.text ?? message.fileName ?? 'Tin nhắn', message.id),
      onCallBack: this.options.onCallBack
    });
    this.#list.setMessages(messages);
    this.#composer = new Composer(this.overlays, (payload) => this.send(payload), () => setTimeout(() => this.#list?.scrollToBottom(false), 80));
    primary.append(this.#list.root, this.#composer.root);
    root.append(primary, mediaHost);

    this.#root = root;
    this.#primary = primary;
    this.#mediaHost = mediaHost;

    if (this.options.conversationSource) {
      this.#live = new LiveConversationSession(
        this.options.conversationSource,
        (canonical) => {
          this.store.state.messages[this.peer.id] = canonical;
          this.#list?.setMessages(canonical);
        },
        (error) => this.options.onError?.(error)
      );
      void this.#live.start().catch((error: unknown) => this.options.onError?.(toError(error)));
    }
    return root;
  }

  unmount(): void {
    this.#live?.stop();
    this.#live = null;
    this.#list?.destroy();
    this.#composer?.destroy();
    this.#list = null;
    this.#composer = null;
    this.#media = null;
    this.#mediaHost = null;
    this.#primary = null;
    this.#root = null;
  }

  focusComposer(): void { this.#composer?.focus(); }

  openMedia(): void {
    if (!this.#root || !this.#mediaHost || !this.#list) return;
    this.#returnScrollTop = this.#list.scrollTop;
    const messages = this.store.state.messages[this.peer.id] ?? [];
    this.#media = new MediaManager(this.overlays, messages, this.options.localParticipantId, this.peer.name, {
      onClose: () => this.closeMedia(),
      onViewOriginal: (messageId) => this.viewOriginal(messageId)
    });
    this.#mediaHost.replaceChildren(this.#media.root);
    this.#mediaHost.hidden = false;
    this.#root.classList.add('media-open');
  }

  closeMedia(): void {
    if (!this.#root || !this.#mediaHost || !this.#list) return;
    this.#root.classList.remove('media-open');
    this.#mediaHost.hidden = true;
    this.#mediaHost.replaceChildren();
    this.#media = null;
    requestAnimationFrame(() => { if (this.#list) this.#list.scrollTop = this.#returnScrollTop; });
  }

  viewOriginal(messageId: string): void {
    if (!this.#root || !this.#mediaHost || !this.#list) return;
    this.#root.classList.remove('media-open');
    this.#mediaHost.hidden = true;
    this.#mediaHost.replaceChildren();
    this.#media = null;
    requestAnimationFrame(() => this.#list?.scrollToMessage(messageId, true));
  }

  appendCallEvent(message: ChatMessage): void {
    const messages = this.store.state.messages[this.peer.id] ??= [];
    messages.push(message);
    this.#list?.append(message);
  }

  private send(payload: ComposerPayload): void {
    const kind: ChatMessage['kind'] = payload.audioDuration ? 'audio' : payload.images.length ? 'image' : payload.fileName ? 'file' : 'text';
    const message: ChatMessage = {
      id: this.options.conversationSource ? createUuid() : createId('msg'),
      senderId: this.options.localParticipantId,
      recipientId: this.peer.id,
      kind,
      text: payload.text || undefined,
      images: payload.images.length ? payload.images : undefined,
      fileName: payload.fileName,
      fileUrl: payload.fileUrl,
      audioDuration: payload.audioDuration,
      replyTo: payload.replyTo,
      replyToId: payload.replyToId,
      time: new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
      status: this.options.conversationSource ? 'sending' : 'sent'
    };
    const messages = this.store.state.messages[this.peer.id] ??= [];
    messages.push(message);
    this.#list?.append(message);
    if (this.#live) void this.#live.send(message, { imageFiles: payload.imageFiles, file: payload.file, audioFile: payload.audioFile }).catch(() => undefined);
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
