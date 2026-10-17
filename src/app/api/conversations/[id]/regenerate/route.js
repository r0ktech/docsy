import { z } from 'zod';
import { route, readJson } from '@/server/http';
import { prepareAnswer } from '@/server/services/chat';
import { sseResponse } from '@/server/sse';
import { idSchema } from '@/lib/validation';

export const maxDuration = 120;

const schema = z.object({ userMessageId: idSchema });

export const POST = route(async (request, { user, params }) => {
  const { userMessageId } = await readJson(request, schema);
  const generator = await prepareAnswer(user, idSchema.parse(params.id), { regenerateFor: userMessageId });
  return sseResponse(generator);
});
