import { route, readJson, json } from '@/server/http';
import { signInSchema } from '@/lib/validation';
import { authenticate } from '@/server/services/auth';
import { createSession, getClientInfo } from '@/server/auth/session';
import { rateLimit, LIMITS } from '@/server/ratelimit';

export const POST = route(
  async (request) => {
    const input = await readJson(request, signInSchema);
    const { ipAddress } = await getClientInfo();
    // Limit per account and per IP so neither credential stuffing nor
    // targeted guessing can proceed quickly.
    await rateLimit(`signin:email:${input.email}`, LIMITS.signIn);
    await rateLimit(`signin:ip:${ipAddress}`, { ...LIMITS.signIn, limit: LIMITS.signIn.limit * 3 });
    const user = await authenticate(input);
    await createSession(user.id);
    return json({ ok: true });
  },
  { auth: false },
);
