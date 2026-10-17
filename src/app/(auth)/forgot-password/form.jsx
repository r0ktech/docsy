'use client';
import { useState } from 'react';
import { AuthForm } from '@/components/auth/auth-form';
import { forgotPasswordSchema } from '@/lib/validation';

export function ForgotPasswordForm() {
  const [result, setResult] = useState(null);
  if (result) {
    return (
      <div role="status" className="rounded-md border border-line bg-surface p-4 text-sm text-ink-2">
        {result.emailConfigured ? (
          <>If an account exists for that email, a reset link is on its way. It expires in an hour.</>
        ) : (
          <>
            Email delivery isn't configured on this deployment, so no email was sent. In development, the reset link is
            printed in the server log.
          </>
        )}
      </div>
    );
  }
  return (
    <AuthForm
      schema={forgotPasswordSchema}
      endpoint="/api/auth/forgot-password"
      submitLabel="Send reset link"
      onSuccess={setResult}
      fields={[{ name: 'email', label: 'Email', type: 'email', autoComplete: 'email', autoFocus: true }]}
    />
  );
}
