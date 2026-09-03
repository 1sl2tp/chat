export interface SupabaseErrorLike { message: string; code?: string; }
export interface SupabaseResult<T> { data: T | null; error: SupabaseErrorLike | null; }

export interface SessionLike { user: { id: string; is_anonymous?: boolean }; }

export interface SupabasePort {
  auth: {
    getSession(): Promise<SupabaseResult<{ session: SessionLike | null }>>;
    signInAnonymously(): Promise<SupabaseResult<{ session: SessionLike | null }>>;
    signInWithPassword(input: { email: string; password: string }): Promise<SupabaseResult<{ session: SessionLike | null }>>;
    updateUser(input: { password: string }): Promise<SupabaseResult<{ user: { id: string } | null }>>;
    signOut(): Promise<{ error: SupabaseErrorLike | null }>;
  };
  rpc<T>(name: string, args?: Record<string, unknown>): Promise<SupabaseResult<T>>;
  select<T>(table: string, query: {
    columns: string;
    eq?: Record<string, string>;
    in?: Record<string, readonly string[]>;
    order?: { column: string; ascending: boolean };
  }): Promise<SupabaseResult<T[]>>;
  functions: {
    invoke<T>(name: string, body: Record<string, unknown>): Promise<SupabaseResult<T>>;
  };
  storage: {
    createSignedUrls(bucket: string, paths: readonly string[], expiresIn: number): Promise<SupabaseResult<Array<{ path: string; signedUrl: string }>>>;
    upload(bucket: string, path: string, file: Blob, options: { contentType: string; upsert: boolean }): Promise<SupabaseResult<{ path: string }>>;
    remove(bucket: string, paths: readonly string[]): Promise<SupabaseResult<unknown[]>>;
  };
  subscribeToConversation(conversationId: string, handlers: {
    onMessageChange: () => void;
    onReadChange: () => void;
    onCallChange: () => void;
  }): () => void;
  subscribeToVoiceCalls(onChange: () => void): () => void;
}

export function requireData<T>(result: SupabaseResult<T>, operation: string): T {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${operation}: empty response`);
  return result.data;
}

export function requireOk(result: { error: SupabaseErrorLike | null }, operation: string): void {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
}
