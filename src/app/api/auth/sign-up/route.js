import { route, readJson, json } from '@/server/http';
import { signUpSchema } from '@/lib/validation';
import { registerUser } from '@/server/services/auth';
import { createSession, getClientInfo } from '@/server/auth/session';
import { rateLimit, LIMITS } from '@/server/ratelimit';

export const POST = route(
  async (request) => {
    const { ipAddress } = await getClientInfo();
    await rateLimit(`signup:${ipAddress}`, LIMITS.signUp);
    const input = await readJson(request, signUpSchema);
    const user = await registerUser(input);
    await createSession(user.id);
    return json({ user: { id: user.id, email: user.email, name: user.name } }, { status: 201 });
  },
  { auth: false },
);
