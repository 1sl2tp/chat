import type { AuthBootstrapOptions, AuthBootstrapResult, SupabaseAuthService } from '../services/supabase/auth-service.js';
import type { SupabaseChatService } from '../services/supabase/chat-service.js';
import { buildAdminRuntimeSession, buildUserRuntimeSession, type RuntimeSessionModel } from './session-model.js';

export type RuntimeDevice = Omit<AuthBootstrapOptions, 'allowAnonymous'>;

type RuntimeAuth = Pick<SupabaseAuthService, 'restore' | 'bootstrap' | 'signInWithUsername'>;
type RuntimeChat = Pick<SupabaseChatService, 'loadAdminDirectory'>;

export class LiveRuntimeBootstrap {
  constructor(
    private readonly auth: RuntimeAuth,
    private readonly chat: RuntimeChat
  ) {}

  async restore(device: RuntimeDevice): Promise<RuntimeSessionModel | null> {
    const restored = await this.auth.restore(device);
    return restored ? this.#session(restored) : null;
  }

  async continueAsGuest(device: RuntimeDevice): Promise<RuntimeSessionModel> {
    const result = await this.auth.bootstrap({ ...device, allowAnonymous: true });
    return this.#session(result);
  }

  async login(username: string, password: string, device: RuntimeDevice): Promise<RuntimeSessionModel> {
    const result = await this.auth.signInWithUsername(username, password, device);
    return this.#session(result);
  }

  async #session(result: AuthBootstrapResult): Promise<RuntimeSessionModel> {
    if (result.identity.is_admin || result.identity.kind === 'admin') {
      return buildAdminRuntimeSession(result, await this.chat.loadAdminDirectory());
    }
    return buildUserRuntimeSession(result);
  }
}
