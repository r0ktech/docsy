import { route, json } from '@/server/http';
import { completeUpload } from '@/server/services/documents';
import { kickJobs } from '@/server/jobs';
import { idSchema } from '@/lib/validation';

export const maxDuration = 60;

export const POST = route(async (_req, { user, params }) => {
  const document = await completeUpload(user.id, idSchema.parse(params.id));
  kickJobs();
  return json({ document });
});
