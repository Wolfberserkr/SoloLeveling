'use server';
import { redirect } from 'next/navigation';
import { createSession, verifyLogin } from '@/lib/auth';

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  try {
    const user = await verifyLogin(email, password);
    createSession(user.id);
  } catch {
    redirect('/login?error=' + encodeURIComponent('Invalid credentials.'));
  }
  redirect('/dashboard');
}
