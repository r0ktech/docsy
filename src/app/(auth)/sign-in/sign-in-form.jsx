'use client';
import Link from 'next/link';
import { AuthForm } from '@/components/auth/auth-form';
import { signInSchema } from '@/lib/validation';

export function SignInForm({ next }) {
  return (
    <AuthForm
      schema={signInSchema}
      endpoint="/api/auth/sign-in"
      submitLabel="Sign in"
      redirectTo={next}
      fields={[
        { name: 'email', label: 'Email', type: 'email', autoComplete: 'email', autoFocus: true },
        { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' },
      ]}
      footer={
        <div className="-mt-1 text-right">
          <Link href="/forgot-password" className="text-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            Forgot password?
          </Link>
        </div>
      }
    />
  );
}
