import { route, json } from '@/server/http';
import { signOutOtherSessions } from '@/server/services/account';

export const DELETE = route(async (_req, { user }) => {
  return json({ signedOut: await signOutOtherSessions(user.id, user.sessionId) });
});
