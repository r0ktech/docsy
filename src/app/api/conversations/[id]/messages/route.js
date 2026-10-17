import { z } from 'zod';
import { route, readJson } from '@/server/http';
import { prepareAnswer } from '@/server/services/chat';
import { sseResponse } from '@/server/sse';
import { idSchema, questionSchema } from '@/lib/validation';

export const maxDuration = 120;

const schema = z.object({ question: questionSchema });

/** Asks a question. Validation errors return JSON; the answer streams as SSE. */
export const POST = route(async (request, { user, params }) => {
  const { question } = await readJson(request, schema);
  const generator = await prepareAnswer(user, idSchema.parse(params.id), { question });
  return sseResponse(generator);
});
