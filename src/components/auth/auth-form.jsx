'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { api } from '@/lib/api';

/**
 * Generic auth form: validates with the shared zod schema on the client for
 * fast feedback; the server re-validates everything.
 */
export function AuthForm({ fields, schema, endpoint, submitLabel, onSuccess, redirectTo, extraBody, footer }) {
  const router = useRouter();
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, ''])));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setFormError('');
    const parsed = schema.safeParse({ ...values, ...extraBody });
    if (!parsed.success) {
      const fieldErrors = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path[0]] ??= issue.message;
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const result = await api(endpoint, { method: 'POST', body: parsed.data });
      if (onSuccess) onSuccess(result);
      if (redirectTo) {
        router.replace(redirectTo);
        router.refresh();
      }
    } catch (err) {
      if (err.details?.fields) {
        setErrors(Object.fromEntries(err.details.fields.map((f) => [f.path, f.message])));
      }
      setFormError(err.message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {formError && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {formError}
        </div>
      )}
      {fields.map((f) => (
        <Field key={f.name} label={f.label} hint={f.hint} error={errors[f.name]}>
          {(props) => (
            <Input
              {...props}
              type={f.type || 'text'}
              name={f.name}
              autoComplete={f.autoComplete}
              autoFocus={f.autoFocus}
              value={values[f.name]}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            />
          )}
        </Field>
      ))}
      {footer}
      <Button type="submit" className="w-full" loading={loading}>
        {submitLabel}
      </Button>
    </form>
  );
}
