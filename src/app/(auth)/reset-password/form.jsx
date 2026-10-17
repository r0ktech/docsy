'use client';
import { AuthForm } from '@/components/auth/auth-form';
import { resetPasswordSchema } from '@/lib/validation';

export function ResetPasswordForm({ token }) {
  return (
    <AuthForm
      schema={resetPasswordSchema}
      endpoint="/api/auth/reset-password"
      submitLabel="Save new password"
      redirectTo="/app"
      extraBody={{ token }}
      fields={[{ name: 'password', label: 'New password', type: 'password', autoComplete: 'new-password', autoFocus: true, hint: 'At least 10 characters.' }]}
    />
  );
}
