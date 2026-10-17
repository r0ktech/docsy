import { route, json } from '@/server/http';
import { receiveUploadBytes } from '@/server/services/documents';
import { idSchema } from '@/lib/validation';

// Local storage driver only. With S3, browsers upload straight to the bucket.
export const PUT = route(async (request, { user, params }) => {
  return json(await receiveUploadBytes(user.id, idSchema.parse(params.id), request));
});
