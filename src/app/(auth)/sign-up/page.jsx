import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { googleConfigured } from '@/server/auth/google';
import { SignUpForm } from './sign-up-form';
import { GoogleButton, Divider } from '@/components/auth/google-button';

export const metadata = { title: 'Create an account' };

export default async function SignUpPage({ searchParams }) {
  const params = await searchParams;
  const next = typeof params.next === 'string' && params.next.startsWith('/') && !params.next.startsWith('//') ? params.next : '/app';
  if (await getSessionUser()) redirect(next);
  return (
    <>
      <h1 className="font-serif text-3xl font-medium tracking-[-0.02em] text-ink">Create your library</h1>
      <p className="mt-1.5 text-sm text-ink-2">Free to start. No card needed.</p>
      <div className="mt-6">
        {googleConfigured() && (
          <>
            <GoogleButton next={next} label="Sign up with Google" />
            <Divider />
          </>
        )}
        <SignUpForm next={next} />
      </div>
      <p className="mt-6 text-center text-sm text-ink-2">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-medium text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
      <p className="mt-4 text-center text-xs leading-relaxed text-ink-3">
        By creating an account you agree to the <Link href="/terms" className="underline">terms</Link> and{' '}
        <Link href="/privacy" className="underline">privacy policy</Link>.
      </p>
    </>
  );
}
