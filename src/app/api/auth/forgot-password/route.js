import { route, readJson, json } from '@/server/http';
import { forgotPasswordSchema } from '@/lib/validation';
import { requestPasswordReset } from '@/server/services/auth';
import { getClientInfo } from '@/server/auth/session';
import { rateLimit, LIMITS } from '@/server/ratelimit';
import { integrationStatus } from '@/server/config';

export const POST = route(
  async (request) => {
    const { email } = await readJson(request, forgotPasswordSchema);
    const { ipAddress } = await getClientInfo();
    await rateLimit(`reset:ip:${ipAddress}`, LIMITS.passwordReset);
    await rateLimit(`reset:email:${email}`, LIMITS.passwordReset);
    await requestPasswordReset(email);
    // Same response whether or not the account exists, to avoid account enumeration.
    return json({ ok: true, emailConfigured: integrationStatus().email.configured });
  },
  { auth: false },
);
