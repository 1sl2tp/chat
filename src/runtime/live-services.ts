import { SupabaseAuthService } from '../services/supabase/auth-service.js';
import { SupabaseAdminDirectoryService } from '../services/supabase/admin-directory-service.js';
import { SupabaseChatService } from '../services/supabase/chat-service.js';
import { LiveKitJsAudioTransport, type LiveKitSdkLike } from '../services/livekit/livekit-js-audio.js';
import { SupabaseVoiceCallService } from '../services/supabase/voice-call-service.js';
import { TaphoaPushService, createBrowserPushRuntime } from '../services/pwa/push-service.js';
import { createTaphoaSupabasePort, type SupabaseCreateClient } from '../services/supabase/client.js';
import type { SupabaseRuntimeConfig } from '../services/supabase/config.js';
import { LiveRuntimeBootstrap } from './live-runtime-bootstrap.js';

export interface LiveSupabaseServices {
  auth: SupabaseAuthService;
  chat: SupabaseChatService;
  call: SupabaseVoiceCallService;
  push: TaphoaPushService;
  adminDirectory: SupabaseAdminDirectoryService;
  bootstrap: LiveRuntimeBootstrap;
}

export async function createLiveSupabaseServices(config: SupabaseRuntimeConfig): Promise<LiveSupabaseServices> {
  const [supabaseModule, livekitModule] = await Promise.all([
    import('@supabase/supabase-js'),
    import('livekit-client')
  ]);
  const port = createTaphoaSupabasePort(config, supabaseModule.createClient as SupabaseCreateClient);
  const auth = new SupabaseAuthService(port);
  const chat = new SupabaseChatService(port);
  const audio = new LiveKitJsAudioTransport(livekitModule as unknown as LiveKitSdkLike);
  const call = new SupabaseVoiceCallService(port, audio);
  const push = new TaphoaPushService(port, createBrowserPushRuntime());
  const adminDirectory = new SupabaseAdminDirectoryService(port);
  return { auth, chat, call, push, adminDirectory, bootstrap: new LiveRuntimeBootstrap(auth, chat) };
}
