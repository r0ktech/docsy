import { route, json } from '@/server/http';
import { retryDocument } from '@/server/services/documents';
import { kickJobs } from '@/server/jobs';
import { idSchema } from '@/lib/validation';

export const POST = route(async (_req, { user, params }) => {
  const document = await retryDocument(user.id, idSchema.parse(params.id));
  kickJobs();
  return json({ document });
});
