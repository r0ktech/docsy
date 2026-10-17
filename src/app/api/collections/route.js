import { route, json, readJson } from '@/server/http';
import { listCollections, createCollection } from '@/server/services/collections';
import { createCollectionSchema } from '@/lib/validation';

export const GET = route(async (_req, { user }) => json({ collections: await listCollections(user.id) }));

export const POST = route(async (request, { user }) => {
  const input = await readJson(request, createCollectionSchema);
  return json({ collection: await createCollection(user.id, input) }, { status: 201 });
});
