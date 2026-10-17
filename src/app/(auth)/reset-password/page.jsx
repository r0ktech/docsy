import Link from 'next/link';
import { ResetPasswordForm } from './form';

export const metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({ searchParams }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="font-serif text-3xl font-medium tracking-[-0.02em] text-ink">Choose a new password</h1>
      {token ? (
        <>
          <p className="mt-1.5 text-sm text-ink-2">This signs you out on every other device.</p>
          <div className="mt-6">
            <ResetPasswordForm token={String(token)} />
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-ink-2">
          This link is missing its reset token.{' '}
          <Link href="/forgot-password" className="font-medium text-ink underline underline-offset-4">Request a new link</Link>.
        </p>
      )}
    </>
  );
}
