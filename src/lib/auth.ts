import { getServerSupabase } from './supabase/server';
import { getAdminSupabase } from './supabase/admin';

export type Hunter = {
  id: string;
  email: string;
  hunter_name: string;
  active_title: string | null;
  timezone: string;
};

export async function signUp(email: string, hunterName: string, password: string) {
  // Admin API skips the email-confirmation redirect flow; user can sign in immediately.
  const admin = getAdminSupabase();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { hunter_name: hunterName },
  });
  if (error) throw new Error(error.message);
  return data.user;
}

export async function signIn(email: string, password: string) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Invalid credentials');
  return data.user;
}

export async function signOut() {
  const supabase = getServerSupabase();
  await supabase.auth.signOut();
}

export async function getCurrentHunter(): Promise<Hunter | null> {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Prefer the profiles table for hunter_name; fall back to user_metadata.
  const admin = getAdminSupabase();
  // Try the full select first; if a column is missing (e.g. migration not
  // yet run), fall back to the minimum-viable columns so the app still loads.
  let profile: any = null;
  const full = await admin
    .from('profiles')
    .select('hunter_name, active_title, timezone')
    .eq('id', user.id)
    .maybeSingle();
  if (full.error) {
    console.warn('[getCurrentHunter] profile full select failed:', full.error.message);
    const min = await admin
      .from('profiles')
      .select('hunter_name, active_title')
      .eq('id', user.id)
      .maybeSingle();
    profile = min.data;
  } else {
    profile = full.data;
  }
  const hunter_name =
    profile?.hunter_name ||
    (user.user_metadata?.hunter_name as string) ||
    user.email?.split('@')[0] ||
    'Hunter';
  return {
    id: user.id,
    email: user.email || '',
    hunter_name,
    active_title: profile?.active_title ?? null,
    timezone: (profile?.timezone as string) || 'UTC',
  };
}

export async function requireHunter(): Promise<Hunter> {
  const h = await getCurrentHunter();
  if (!h) throw new Error('UNAUTHORIZED');
  return h;
}
