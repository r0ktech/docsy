import { route, json, readJson } from '@/server/http';
import { createUpload, createUploadSchema } from '@/server/services/documents';
import { rateLimit, LIMITS } from '@/server/ratelimit';

export const POST = route(async (request, { user }) => {
  await rateLimit(`upload:${user.id}`, LIMITS.upload);
  const input = await readJson(request, createUploadSchema);
  return json(await createUpload(user, input), { status: 201 });
});
