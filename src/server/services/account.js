import 'server-only';
import { prisma } from '@/server/db';
import { getStorage } from '@/server/storage';
import { log } from '@/server/log';

export async function updateProfile(userId, { name }) {
  return prisma.user.update({ where: { id: userId }, data: { name }, select: { id: true, name: true, email: true } });
}

/**
 * Permanently deletes the account: database rows cascade from User (documents,
 * chunks, conversations, citations, sessions, usage), then stored files go.
 */
export async function deleteAccount(userId) {
  const docs = await prisma.document.findMany({ where: { userId }, select: { storageKey: true } });
  await prisma.user.delete({ where: { id: userId } });
  const storage = getStorage();
  await Promise.all(
    docs.map((d) => storage.deleteObject(d.storageKey).catch((err) => log.warn('Orphaned storage object', { key: d.storageKey, err }))),
  );
}

export async function getAccount(userId) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      createdAt: true,
      passwordHash: true,
      oauthAccounts: { select: { provider: true } },
      _count: { select: { sessions: true } },
    },
  });
  const { passwordHash, oauthAccounts, _count, ...rest } = user;
  return {
    ...rest,
    hasPassword: Boolean(passwordHash),
    providers: oauthAccounts.map((a) => a.provider),
    activeSessions: _count.sessions,
  };
}

export async function signOutOtherSessions(userId, currentSessionId) {
  const { count } = await prisma.session.deleteMany({ where: { userId, id: { not: currentSessionId } } });
  return count;
}
