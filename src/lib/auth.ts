import { getServerSupabase } from './supabase/server';
import { getAdminSupabase } from './supabase/admin';

export type Hunter = {
  id: string;
  email: string;
  hunter_name: string;
};

export async function signUp(email: string, hunterName: string, password: string) {
  // Use the admin API so we skip GoTrue's email-confirmation redirect flow entirely.
  // The user is created with email_confirm: true so they can sign in immediately.
  const admin = getAdminSupabase();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { hunter_name: hunterName },
  });
  if (error) {
    console.error('[signUp] admin.createUser error:', {
      message: error.message,
      status: (error as any).status,
      code: (error as any).code,
      name: error.name,
    });
    throw new Error(error.message);
  }
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
  const { data: profile } = await admin
    .from('profiles')
    .select('hunter_name')
    .eq('id', user.id)
    .maybeSingle();
  const hunter_name =
    profile?.hunter_name ||
    (user.user_metadata?.hunter_name as string) ||
    user.email?.split('@')[0] ||
    'Hunter';
  return { id: user.id, email: user.email || '', hunter_name };
}

export async function requireHunter(): Promise<Hunter> {
  const h = await getCurrentHunter();
  if (!h) throw new Error('UNAUTHORIZED');
  return h;
}
