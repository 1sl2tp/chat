import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    base: './',
    define: {
      __TAPHOA_SUPABASE_URL__: JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
      __TAPHOA_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '')
    }
  };
});
