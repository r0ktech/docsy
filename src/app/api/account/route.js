import { z } from 'zod';
import { route, json, readJson } from '@/server/http';
import { updateProfileSchema } from '@/lib/validation';
import { updateProfile, deleteAccount, getAccount } from '@/server/services/account';
import { destroySession } from '@/server/auth/session';

export const GET = route(async (_req, { user }) => json({ account: await getAccount(user.id) }));

export const PATCH = route(async (request, { user }) => {
  const input = await readJson(request, updateProfileSchema);
  return json({ user: await updateProfile(user.id, input) });
});

const deleteSchema = z.object({ confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm.' }) }) });

export const DELETE = route(async (request, { user }) => {
  await readJson(request, deleteSchema);
  await deleteAccount(user.id);
  await destroySession();
  return json({ ok: true });
});
