import { z } from 'zod';
import { route, json, readJson } from '@/server/http';
import { listConversations, createConversation } from '@/server/services/conversations';
import { scopeSchema } from '@/lib/validation';

export const GET = route(async (request, { user }) => {
  const params = new URL(request.url).searchParams;
  const q = params.get('q')?.trim().slice(0, 200) || undefined;
  const cursor = params.get('cursor') || undefined;
  return json(await listConversations(user.id, { q, cursor }));
});

const createSchema = z.object({ scope: scopeSchema.default({ type: 'LIBRARY' }) });

export const POST = route(async (request, { user }) => {
  const { scope } = await readJson(request, createSchema);
  return json({ conversation: await createConversation(user.id, { scope }) }, { status: 201 });
});
