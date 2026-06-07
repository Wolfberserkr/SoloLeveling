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
  let errMsg: string | null = null;
  try {
    await signUp(email, hunterName, password);
  } catch (e: any) {
    errMsg = e?.message || 'Sign-up failed.';
  }
  if (errMsg) {
    redirect('/signup?error=' + encodeURIComponent(errMsg));
  }
  try { await signIn(email, password); } catch {}
  redirect('/dashboard');
}


