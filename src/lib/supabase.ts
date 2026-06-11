import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey && !anonKey.includes('your-anon-key'));

export const supabase = createClient(
  url ?? 'https://npqpzzarohlvexqpqurg.supabase.co',
  anonKey ?? 'anon-key-not-configured',
);
