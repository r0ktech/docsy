import { route, json, readJson } from '@/server/http';
import { changePasswordSchema } from '@/lib/validation';
import { changePassword } from '@/server/services/auth';
import { signOutOtherSessions } from '@/server/services/account';
import { rateLimit } from '@/server/ratelimit';

export const POST = route(async (request, { user }) => {
  await rateLimit(`password-change:${user.id}`, { limit: 5, windowSeconds: 900 });
  const input = await readJson(request, changePasswordSchema);
  await changePassword(user.id, input);
  const signedOut = await signOutOtherSessions(user.id, user.sessionId);
  return json({ ok: true, signedOut });
});
