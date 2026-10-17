import { z } from 'zod';
import { route, json, readJson } from '@/server/http';
import { deleteDocuments } from '@/server/services/documents';
import { idSchema } from '@/lib/validation';

const schema = z.object({ ids: z.array(idSchema).min(1).max(100) });

export const POST = route(async (request, { user }) => {
  const { ids } = await readJson(request, schema);
  return json(await deleteDocuments(user.id, ids));
});
