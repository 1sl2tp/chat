import type { SupabasePort, SupabaseResult } from './port.js';

interface QueryLike {
  select(columns: string): QueryLike;
  eq(column: string, value: string): QueryLike;
  in(column: string, values: readonly string[]): QueryLike;
  order(column: string, options: { ascending: boolean }): QueryLike;
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

interface StorageBucketLike {
  createSignedUrls(paths: readonly string[], expiresIn: number): Promise<{ data: unknown; error: unknown }>;
  upload(path: string, file: Blob, options: { contentType: string; upsert: boolean }): Promise<{ data: unknown; error: unknown }>;
  remove(paths: readonly string[]): Promise<{ data: unknown; error: unknown }>;
}

interface ChannelLike {
  on(kind: string, filter: Record<string, string>, handler: () => void): ChannelLike;
  subscribe(): ChannelLike;
}

export interface SupabaseJsClientLike {
  auth: SupabasePort['auth'];
  rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  from(table: string): QueryLike;
  storage: { from(bucket: string): StorageBucketLike };
  functions: { invoke(name: string, options: { body: Record<string, unknown> }): Promise<{ data: unknown; error: unknown }> };
  channel(name: string): ChannelLike;
  removeChannel(channel: ChannelLike): Promise<unknown> | unknown;
}

export class SupabaseJsPort implements SupabasePort {
  readonly auth: SupabasePort['auth'];

  constructor(private readonly client: SupabaseJsClientLike) {
    this.auth = client.auth;
  }

  async rpc<T>(name: string, args?: Record<string, unknown>): Promise<SupabaseResult<T>> {
    const result = await this.client.rpc(name, args);
    return normalizeResult<T>(result);
  }

  async select<T>(table: string, query: {
    columns: string;
    eq?: Record<string, string>;
    in?: Record<string, readonly string[]>;
    order?: { column: string; ascending: boolean };
  }): Promise<SupabaseResult<T[]>> {
    let builder = this.client.from(table).select(query.columns);
    for (const [column, value] of Object.entries(query.eq ?? {})) builder = builder.eq(column, value);
    for (const [column, values] of Object.entries(query.in ?? {})) builder = builder.in(column, values);
    if (query.order) builder = builder.order(query.order.column, { ascending: query.order.ascending });
    const result = await builder;
    return normalizeResult<T[]>(result);
  }

  readonly functions: SupabasePort['functions'] = {
    invoke: async (name, body) => {
      const result = await this.client.functions.invoke(name, { body });
      return normalizeResult(result);
    }
  };

  readonly storage: SupabasePort['storage'] = {
    createSignedUrls: async (bucket, paths, expiresIn) => {
      const result = await this.client.storage.from(bucket).createSignedUrls(paths, expiresIn);
      return normalizeResult<Array<{ path: string; signedUrl: string }>>(result);
    },
    upload: async (bucket, path, file, options) => {
      const result = await this.client.storage.from(bucket).upload(path, file, options);
      return normalizeResult<{ path: string }>(result);
    },
    remove: async (bucket, paths) => {
      const result = await this.client.storage.from(bucket).remove(paths);
      return normalizeResult<unknown[]>(result);
    }
  };

  subscribeToConversation(conversationId: string, handlers: {
    onMessageChange: () => void;
    onReadChange: () => void;
    onCallChange: () => void;
  }): () => void {
    const filter = `conversation_id=eq.${conversationId}`;
    const channel = this.client
      .channel(`taphoa-chat:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter }, handlers.onMessageChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_conversation_members', filter }, handlers.onReadChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_calls', filter }, handlers.onCallChange)
      .subscribe();
    return () => { void this.client.removeChannel(channel); };
  }

  subscribeToVoiceCalls(onChange: () => void): () => void {
    const channel = this.client
      .channel('taphoa-chat:voice-calls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_calls' }, onChange)
      .subscribe();
    return () => { void this.client.removeChannel(channel); };
  }
}

function normalizeResult<T>(result: { data: unknown; error: unknown }): SupabaseResult<T> {
  const error = result.error && typeof result.error === 'object' && 'message' in result.error
    ? { message: String((result.error as { message: unknown }).message) }
    : result.error
      ? { message: String(result.error) }
      : null;
  return { data: (result.data ?? null) as T | null, error };
}
