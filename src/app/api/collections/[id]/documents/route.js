import { z } from 'zod';
import { route, json, readJson } from '@/server/http';
import { addDocumentsToCollection, removeDocumentsFromCollection } from '@/server/services/collections';
import { idSchema } from '@/lib/validation';

const schema = z.object({ documentIds: z.array(idSchema).min(1).max(100) });

export const POST = route(async (request, { user, params }) => {
  const { documentIds } = await readJson(request, schema);
  return json({ collection: await addDocumentsToCollection(user.id, idSchema.parse(params.id), documentIds) });
});

export const DELETE = route(async (request, { user, params }) => {
  const { documentIds } = await readJson(request, schema);
  return json({ collection: await removeDocumentsFromCollection(user.id, idSchema.parse(params.id), documentIds) });
});
