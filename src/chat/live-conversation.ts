import type { ChatMessage } from '../app/types.js';

export type ConversationChange = 'message' | 'read' | 'call';

export interface ConversationMediaPayload {
  imageFiles?: File[];
  file?: File;
  audioFile?: File;
}

export interface ChatConversationSource {
  load(): Promise<ChatMessage[]>;
  send(message: ChatMessage, media?: ConversationMediaPayload): Promise<void>;
  markRead(): Promise<void>;
  subscribe(onChange: (kind: ConversationChange) => void): () => void;
}

export class LiveConversationSession {
  #unsubscribe: (() => void) | null = null;
  #stopped = false;
  #queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly source: ChatConversationSource,
    private readonly onMessages: (messages: ChatMessage[]) => void,
    private readonly onError: (error: Error) => void = () => undefined
  ) {}

  async start(): Promise<void> {
    this.#stopped = false;
    this.#unsubscribe = this.source.subscribe((kind) => {
      this.#enqueueRefresh(kind === 'message');
    });
    await this.#refresh(true);
  }

  stop(): void {
    this.#stopped = true;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  async send(message: ChatMessage, media?: ConversationMediaPayload): Promise<void> {
    try {
      await this.source.send(message, media);
      await this.#refresh(false);
    } catch (error) {
      this.onError(toError(error));
      await this.#refresh(false).catch((refreshError) => this.onError(toError(refreshError)));
      throw error;
    }
  }

  whenIdle(): Promise<void> {
    return this.#queue;
  }

  #enqueueRefresh(markRead: boolean): void {
    this.#queue = this.#queue
      .then(() => this.#refresh(markRead))
      .catch((error) => this.onError(toError(error)));
  }

  async #refresh(markRead: boolean): Promise<void> {
    const messages = await this.source.load();
    if (this.#stopped) return;
    this.onMessages(messages);
    if (markRead) await this.source.markRead();
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
