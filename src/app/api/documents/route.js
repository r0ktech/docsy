import { route, json } from '@/server/http';
import { listDocuments } from '@/server/services/documents';

export const GET = route(async (request, { user }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return json(await listDocuments(user.id, params));
});
