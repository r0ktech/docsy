import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { googleConfigured } from '@/server/auth/google';
import { SignInForm } from './sign-in-form';
import { GoogleButton, Divider } from '@/components/auth/google-button';

export const metadata = { title: 'Sign in' };

const ERRORS = {
  google_failed: 'Google sign-in did not complete. Please try again.',
  google_not_configured: 'Google sign-in is not configured on this deployment.',
};

function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/app';
}

export default async function SignInPage({ searchParams }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getSessionUser()) redirect(next);
  const notice = params.expired ? 'Your session ended. Sign in again to continue.' : ERRORS[params.error];
  return (
    <>
      <h1 className="font-serif text-3xl font-medium tracking-[-0.02em] text-ink">Welcome back</h1>
      <p className="mt-1.5 text-sm text-ink-2">Sign in to your Docsy library.</p>
      {notice && (
        <p role="status" className="mt-5 rounded-md border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
          {notice}
        </p>
      )}
      <div className="mt-6">
        {googleConfigured() && (
          <>
            <GoogleButton next={next} />
            <Divider />
          </>
        )}
        <SignInForm next={next} />
      </div>
      <p className="mt-6 text-center text-sm text-ink-2">
        New to Docsy?{' '}
        <Link href={`/sign-up${next !== '/app' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-ink underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </>
  );
}
