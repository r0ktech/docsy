import { z } from 'zod';
import { route, json, readJson } from '@/server/http';
import { getDocumentDetail, renameDocument, deleteDocuments } from '@/server/services/documents';
import { idSchema } from '@/lib/validation';

export const GET = route(async (_req, { user, params }) => {
  return json({ document: await getDocumentDetail(user.id, idSchema.parse(params.id)) });
});

const patchSchema = z.object({ title: z.string().trim().min(1, 'Title cannot be empty.').max(200) });

export const PATCH = route(async (request, { user, params }) => {
  const { title } = await readJson(request, patchSchema);
  return json({ document: await renameDocument(user.id, idSchema.parse(params.id), title) });
});

export const DELETE = route(async (_req, { user, params }) => {
  return json(await deleteDocuments(user.id, [idSchema.parse(params.id)]));
});
