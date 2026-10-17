import { route, readJson, json } from '@/server/http';
import { resetPasswordSchema } from '@/lib/validation';
import { resetPassword } from '@/server/services/auth';
import { createSession, getClientInfo } from '@/server/auth/session';
import { rateLimit } from '@/server/ratelimit';

export const POST = route(
  async (request) => {
    const { ipAddress } = await getClientInfo();
    await rateLimit(`reset-confirm:${ipAddress}`, { limit: 10, windowSeconds: 3600 });
    const input = await readJson(request, resetPasswordSchema);
    const { userId } = await resetPassword(input);
    await createSession(userId);
    return json({ ok: true });
  },
  { auth: false },
);
