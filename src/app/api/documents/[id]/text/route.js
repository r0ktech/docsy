import { route, json } from '@/server/http';
import { getDocumentText } from '@/server/services/documents';
import { idSchema } from '@/lib/validation';

export const GET = route(async (_req, { user, params }) => {
  return json({ segments: await getDocumentText(user.id, idSchema.parse(params.id)) });
});
