import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { prisma } from '@/server/db';
import { getConfig } from '@/server/config';
import { randomToken, sha256 } from '@/server/crypto';
import { Errors } from '@/server/errors';

const DAY_MS = 24 * 60 * 60 * 1000;

export function sessionCookieName() {
  // The __Host- prefix forces Secure, Path=/ and no Domain attribute, so the
  // cookie cannot be set or overridden by a subdomain.
  return isSecureContext() ? '__Host-docsy_session' : 'docsy_session';
}

function isSecureContext() {
  return getConfig().APP_URL.startsWith('https://');
}

export async function getClientInfo() {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  return {
    ipAddress: (forwarded ? forwarded.split(',')[0] : h.get('x-real-ip'))?.trim() || null,
    userAgent: h.get('user-agent')?.slice(0, 300) || null,
  };
}

export async function createSession(userId) {
  const token = randomToken(32);
  const ttlDays = getConfig().SESSION_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);
  const info = await getClientInfo();
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt, ...info },
  });
  const jar = await cookies();
  jar.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  return { expiresAt };
}

/**
 * Resolves the signed-in user from the session cookie. Memoised per request.
 * Expired sessions are deleted; active sessions slide forward at most once a day.
 */
export const getSessionUser = cache(async () => {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: publicUserSelect } },
  });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  if (now - session.lastUsedAt.getTime() > DAY_MS) {
    const ttlDays = getConfig().SESSION_TTL_DAYS;
    await prisma.session
      .update({
        where: { id: session.id },
        data: { lastUsedAt: new Date(now), expiresAt: new Date(now + ttlDays * DAY_MS) },
      })
      .catch(() => {});
  }

  return { ...session.user, sessionId: session.id };
});

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw Errors.unauthorized();
  return user;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  jar.delete(sessionCookieName());
}

export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  plan: true,
  createdAt: true,
  passwordHash: false,
};
