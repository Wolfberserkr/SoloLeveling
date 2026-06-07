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
  let signUpFailed = false;
  let errMsg = 'Sign-up failed.';
  try {
    await signUp(email, hunterName, password);
  } catch (e: any) {
    console.error('[signupAction] caught:', e);
    signUpFailed = true;
    errMsg = e?.message || errMsg;
  }
  if (signUpFailed) {
    redirect('/signup?error=' + encodeURIComponent(errMsg));
  }
  try { await signIn(email, password); } catch (e) {
    console.error('[signupAction] signIn after signUp failed:', e);
  }
  redirect('/dashboard');
}
