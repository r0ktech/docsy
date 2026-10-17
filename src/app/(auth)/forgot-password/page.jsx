import Link from 'next/link';
import { ForgotPasswordForm } from './form';

export const metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-serif text-3xl font-medium tracking-[-0.02em] text-ink">Reset your password</h1>
      <p className="mt-1.5 text-sm text-ink-2">We'll email you a link to choose a new one.</p>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
      <p className="mt-6 text-center text-sm text-ink-2">
        <Link href="/sign-in" className="font-medium text-ink underline underline-offset-4">Back to sign in</Link>
      </p>
    </>
  );
}
