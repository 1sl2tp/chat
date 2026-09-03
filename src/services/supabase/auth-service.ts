import type { SupabasePort } from './port.js';
import { requireData, requireOk } from './port.js';
import type { BootstrapIdentity, ResolvedIdentity, SupportEntry } from './types.js';

export interface AuthBootstrapOptions {
  allowAnonymous: boolean;
  label: string;
  platform: string;
  legacyGuestToken?: string | null;
}

export interface AuthBootstrapResult {
  bootstrap: BootstrapIdentity;
  identity: ResolvedIdentity;
  support: SupportEntry;
}

export interface DeviceKeyProvider {
  loadDeviceKey(): string;
}

export class SupabaseAuthService {
  constructor(
    private readonly port: SupabasePort,
    private readonly deviceKeys: DeviceKeyProvider = { loadDeviceKey: defaultDeviceKey }
  ) {}

  async restore(options: Omit<AuthBootstrapOptions, 'allowAnonymous'>): Promise<AuthBootstrapResult | null> {
    const sessionResult = await this.port.auth.getSession();
    const current = requireData(sessionResult, 'auth session').session;
    if (!current) return null;
    return this.resolveBootstrap({ ...options, allowAnonymous: false });
  }

  async bootstrap(options: AuthBootstrapOptions): Promise<AuthBootstrapResult> {
    const sessionResult = await this.port.auth.getSession();
    const current = requireData(sessionResult, 'auth session').session;
    if (!current) {
      if (!options.allowAnonymous) throw new Error('auth session required');
      const anonymous = requireData(await this.port.auth.signInAnonymously(), 'anonymous sign-in');
      if (!anonymous.session) throw new Error('anonymous sign-in: session missing');
    }
    return this.resolveBootstrap(options);
  }

  async signInWithUsername(username: string, password: string, device: Omit<AuthBootstrapOptions, 'allowAnonymous'>): Promise<AuthBootstrapResult> {
    const email = usernameLoginEmail(username);
    const signedIn = requireData(await this.port.auth.signInWithPassword({ email, password }), 'password sign-in');
    if (!signedIn.session) throw new Error('password sign-in: session missing');
    return this.resolveBootstrap({ ...device, allowAnonymous: false });
  }

  async updateRegisteredAccount(input: { name: string; username: string; password?: string }): Promise<{ name: string; username: string }> {
    const name = input.name.trim();
    const username = input.username.trim().replace(/^@+/, '').toLowerCase();
    const updated = requireData(await this.port.rpc<{ display_name: string; username: string }>('chat_update_user2_account', {
      p_display_name: name,
      p_username: username
    }), 'update user account');
    const password = input.password?.trim() ?? '';
    if (password && password !== '••••••') requireData(await this.port.auth.updateUser({ password }), 'update password');
    return { name: updated.display_name, username: updated.username };
  }

  async signOut(): Promise<void> {
    requireOk(await this.port.auth.signOut(), 'sign out');
  }

  private async resolveBootstrap(options: AuthBootstrapOptions): Promise<AuthBootstrapResult> {
    const bootstrap = requireData(await this.port.rpc<BootstrapIdentity>('chat_bootstrap_identity', {
      p_legacy_guest_token: options.legacyGuestToken ?? null,
      p_device_key: this.deviceKeys.loadDeviceKey(),
      p_label: options.label,
      p_platform: options.platform
    }), 'chat bootstrap');
    const identity = requireData(await this.port.rpc<ResolvedIdentity>('chat_resolve_identity'), 'identity resolve');
    const support = requireData(await this.port.rpc<SupportEntry>('chat_get_support_entry'), 'support entry');
    return { bootstrap, identity, support };
  }
}

export function usernameLoginEmail(username: string): string {
  const normalized = username.trim().replace(/^@+/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(normalized)) throw new Error('invalid username');
  return `${normalized}@taphoa.chat`;
}

const DEVICE_KEY_STORAGE = 'taphoa.chat.device-key.v1';

function defaultDeviceKey(): string {
  const storage = globalThis.localStorage;
  const existing = storage?.getItem(DEVICE_KEY_STORAGE);
  if (existing && UUID_RE.test(existing)) return existing;
  const next = createUuidV4();
  storage?.setItem(DEVICE_KEY_STORAGE, next);
  return next;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createUuidV4(): string {
  const api = globalThis.crypto;
  if (api && typeof api.randomUUID === 'function') return api.randomUUID();
  const bytes = new Uint8Array(16);
  if (api && typeof api.getRandomValues === 'function') api.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
