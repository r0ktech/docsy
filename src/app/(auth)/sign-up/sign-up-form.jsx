'use client';
import { AuthForm } from '@/components/auth/auth-form';
import { signUpSchema } from '@/lib/validation';

export function SignUpForm({ next }) {
  return (
    <AuthForm
      schema={signUpSchema}
      endpoint="/api/auth/sign-up"
      submitLabel="Create account"
      redirectTo={next}
      fields={[
        { name: 'name', label: 'Name', autoComplete: 'name', autoFocus: true },
        { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
        { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password', hint: 'At least 10 characters.' },
      ]}
    />
  );
}
