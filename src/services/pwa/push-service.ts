import type { SupabasePort } from '../supabase/port.js';
import { requireData } from '../supabase/port.js';

export type PushSetupResult = 'unsupported' | 'permission-required' | 'denied' | 'subscribed' | 'disabled';

interface PushSubscriptionJsonLike {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export interface PushSubscriptionLike {
  endpoint: string;
  toJSON(): PushSubscriptionJsonLike;
  unsubscribe(): Promise<boolean>;
}

export interface PushManagerLike {
  getSubscription(): Promise<PushSubscriptionLike | null>;
  subscribe(options: { userVisibleOnly: true; applicationServerKey: Uint8Array<ArrayBuffer> }): Promise<PushSubscriptionLike>;
}

export interface PushRegistrationLike {
  pushManager: PushManagerLike;
}

export interface PushBrowserRuntime {
  readonly supported: boolean;
  readonly permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  register(path: string): Promise<PushRegistrationLike>;
}

interface PushConfigResult { public_key: string; }

export class TaphoaPushService {
  constructor(
    private readonly port: Pick<SupabasePort, 'rpc' | 'functions'>,
    private readonly browser: PushBrowserRuntime
  ) {}

  async start(deviceId: string): Promise<PushSetupResult> {
    if (!this.browser.supported) return 'unsupported';
    const registration = await this.browser.register('./sw.js');
    if (this.browser.permission === 'denied') return 'denied';
    if (this.browser.permission !== 'granted') return 'permission-required';
    return this.syncSubscription(registration, deviceId);
  }

  async enable(deviceId: string): Promise<PushSetupResult> {
    if (!this.browser.supported) return 'unsupported';
    let permission = this.browser.permission;
    if (permission !== 'granted' && permission !== 'denied') permission = await this.browser.requestPermission();
    if (permission !== 'granted') return 'denied';
    const registration = await this.browser.register('./sw.js');
    return this.syncSubscription(registration, deviceId);
  }

  async disable(deviceId: string): Promise<PushSetupResult> {
    if (!this.browser.supported) return 'unsupported';
    const registration = await this.browser.register('./sw.js');
    const subscription = await registration.pushManager.getSubscription();
    requireData(await this.port.rpc<boolean>('chat_delete_call_push_subscription', { p_device_id: deviceId }), 'delete push subscription');
    if (subscription) await subscription.unsubscribe();
    return 'disabled';
  }

  private async syncSubscription(registration: PushRegistrationLike, deviceId: string): Promise<PushSetupResult> {
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const config = requireData(await this.port.functions.invoke<PushConfigResult>('taphoaxyz-call-push', { action: 'config' }), 'load push config');
      if (!config.public_key) throw new Error('push public key missing');
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.public_key)
      });
    }
    const serialized = subscription.toJSON();
    const endpoint = serialized.endpoint ?? subscription.endpoint;
    const p256dh = serialized.keys?.p256dh ?? '';
    const auth = serialized.keys?.auth ?? '';
    if (!endpoint || !p256dh || !auth) throw new Error('push subscription incomplete');
    requireData(await this.port.rpc<boolean>('chat_upsert_call_push_subscription', {
      p_device_id: deviceId,
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth: auth
    }), 'upsert push subscription');
    return 'subscribed';
  }
}

export function createBrowserPushRuntime(): PushBrowserRuntime {
  return {
    get supported() {
      return typeof navigator !== 'undefined'
        && 'serviceWorker' in navigator
        && typeof window !== 'undefined'
        && 'PushManager' in window
        && 'Notification' in window;
    },
    get permission() {
      return typeof Notification === 'undefined' ? 'denied' : Notification.permission;
    },
    requestPermission: () => Notification.requestPermission(),
    register: async (path) => {
      const registration = await navigator.serviceWorker.register(path);
      return registration as unknown as PushRegistrationLike;
    }
  };
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(base64);
  const buffer = new ArrayBuffer(decoded.length);
  const output = new Uint8Array(buffer);
  for (let index = 0; index < decoded.length; index += 1) output[index] = decoded.charCodeAt(index);
  return output;
}
