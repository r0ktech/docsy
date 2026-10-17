import { z } from 'zod';
import { route, json, readJson } from '@/server/http';
import { getCollection, updateCollection, deleteCollection } from '@/server/services/collections';
import { collectionNameSchema, idSchema } from '@/lib/validation';

export const GET = route(async (_req, { user, params }) =>
  json({ collection: await getCollection(user.id, idSchema.parse(params.id)) }),
);

const patchSchema = z.object({
  name: collectionNameSchema.optional(),
  description: z.string().trim().max(280).nullable().optional(),
});

export const PATCH = route(async (request, { user, params }) => {
  const data = await readJson(request, patchSchema);
  return json({ collection: await updateCollection(user.id, idSchema.parse(params.id), data) });
});

export const DELETE = route(async (_req, { user, params }) => {
  await deleteCollection(user.id, idSchema.parse(params.id));
  return json({ ok: true });
});
