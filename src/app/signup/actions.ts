'use server';
import { redirect } from 'next/navigation';
import { signUp, signIn } from '@/lib/auth';

export async function signupAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const hunterName = String(formData.get('hunter_name') || '').trim();
  const password = String(formData.get('password') || '');
  if (!email || !hunterName || password.length < 8) {
    redirect('/signup?error=' + encodeURIComponent('Provide a name, email, and 8+ char password.'));
  }
  try {
    await signUp(email, hunterName, password);
    // Sign in immediately so the session cookie is set (skips email verification gate
    // if your Supabase project requires confirmation — adjust in Auth > Settings).
    try { await signIn(email, password); } catch {}
  } catch (e: any) {
    redirect('/signup?error=' + encodeURIComponent(e.message || 'Sign-up failed.'));
  }
  redirect('/dashboard');
}
