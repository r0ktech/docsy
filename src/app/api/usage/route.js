import { route, json } from '@/server/http';
import { getUsage } from '@/server/services/usage';

export const GET = route(async (_req, { user }) => json({ usage: await getUsage(user.id, user.plan) }));
