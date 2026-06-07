'use server';
import { redirect } from 'next/navigation';
import { createUser, createSession } from '@/lib/auth';
import { unlock } from '@/lib/achievements';

export async function signupAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const hunterName = String(formData.get('hunter_name') || '').trim();
  const password = String(formData.get('password') || '');
  if (!email || !hunterName || password.length < 8) {
    redirect('/signup?error=' + encodeURIComponent('Provide a name, email, and 8+ char password.'));
  }
  try {
    const user = await createUser(email, hunterName, password);
    createSession(user.id);
    unlock(user.id, 'awakening');
  } catch (e: any) {
    redirect('/signup?error=' + encodeURIComponent(e.message || 'Sign-up failed.'));
  }
  redirect('/dashboard');
}
