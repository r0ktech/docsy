import { z } from 'zod';
import { route, json, readJson } from '@/server/http';
import { getConversation, renameConversation, deleteConversation } from '@/server/services/conversations';
import { idSchema } from '@/lib/validation';

export const GET = route(async (_req, { user, params }) =>
  json({ conversation: await getConversation(user.id, idSchema.parse(params.id)) }),
);

const patchSchema = z.object({ title: z.string().trim().min(1, 'Title cannot be empty.').max(120) });

export const PATCH = route(async (request, { user, params }) => {
  const { title } = await readJson(request, patchSchema);
  return json(await renameConversation(user.id, idSchema.parse(params.id), title));
});

export const DELETE = route(async (_req, { user, params }) => {
  await deleteConversation(user.id, idSchema.parse(params.id));
  return json({ ok: true });
});
