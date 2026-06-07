'use server';
import { redirect } from 'next/navigation';
import { signIn } from '@/lib/auth';

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  try {
    await signIn(email, password);
  } catch {
    redirect('/login?error=' + encodeURIComponent('Invalid credentials.'));
  }
  redirect('/dashboard');
}
