'use server';
import { redirect } from 'next/navigation';
import { signUp, signIn } from '@/lib/auth';

export async function signupAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const hunterName = String(formData.get('hunter_name') || '').trim();
  const password = String(formData.get('password') || '');

  // Loud diagnostic: confirms which env vars Vercel actually sees at runtime.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  console.error('[signupAction] env check:', {
    hasUrl: !!url,
    urlLen: url?.length ?? 0,
    urlPrefix: url?.slice(0, 25),
    urlSuffix: url?.slice(-15),
    urlHasTrailingSlash: url?.endsWith('/') ?? false,
    hasAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    anonLen: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length ?? 0,
    hasService: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    serviceLen: process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0,
    sameAsAnon:
      process.env.SUPABASE_SERVICE_ROLE_KEY ===
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!email || !hunterName || password.length < 8) {
    redirect('/signup?error=' + encodeURIComponent('Provide a name, email, and 8+ char password.'));
  }
  let signUpFailed = false;
  let errMsg = 'Sign-up failed.';
  try {
    await signUp(email, hunterName, password);
  } catch (e: any) {
    console.error('[signupAction] caught:', {
      name: e?.name,
      message: e?.message,
      stack: e?.stack,
      stringified: JSON.stringify(e, Object.getOwnPropertyNames(e || {})),
    });
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

