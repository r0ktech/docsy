import 'server-only';
import { prisma } from '@/server/db';
import { Errors } from '@/server/errors';
import { getConfig } from '@/server/config';
import { hashPassword, verifyPassword, burnPasswordCheck } from '@/server/auth/password';
import { randomToken, sha256 } from '@/server/crypto';
import { sendEmail } from '@/server/email';

const RESET_TTL_MS = 60 * 60 * 1000;

export async function registerUser({ name, email, password }) {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw Errors.conflict('EMAIL_IN_USE', 'An account with this email already exists. Try signing in instead.');
  }
  const passwordHash = await hashPassword(password);
  return prisma.user.create({ data: { name, email, passwordHash }, select: { id: true, email: true, name: true } });
}

export async function authenticate({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  if (!user || !user.passwordHash) {
    await burnPasswordCheck(password);
    throw invalidCredentials(user && !user.passwordHash);
  }
  if (!(await verifyPassword(user.passwordHash, password))) throw invalidCredentials(false);
  return user;
}

function invalidCredentials(oauthOnly) {
  return Errors.validation(
    oauthOnly
      ? 'This account uses Google sign-in. Continue with Google, or reset your password to add one.'
      : 'That email and password combination is incorrect.',
  );
}

/** Always resolves the same way whether or not the account exists. */
export async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return;
  const token = randomToken(32);
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    }),
  ]);
  const link = `${getConfig().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: 'Reset your Docsy password',
    text: `Someone asked to reset the password for your Docsy account.\n\nReset it here (valid for 1 hour):\n${link}\n\nIf this wasn't you, ignore this email.`,
  });
}

export async function resetPassword({ token, password }) {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw Errors.validation('This reset link is invalid or has expired. Request a new one.');
  }
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Resetting a password signs out every existing session.
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  return { userId: record.userId };
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (user.passwordHash && !(await verifyPassword(user.passwordHash, currentPassword || ''))) {
    throw Errors.validation('Your current password is incorrect.');
  }
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
}

/**
 * Links a verified Google identity to a user. Existing accounts with the same
 * verified email are linked rather than duplicated.
 */
export async function findOrCreateGoogleUser({ sub, email, emailVerified, name, picture }) {
  if (!emailVerified) throw Errors.validation('Your Google account email is not verified.');
  const account = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: 'google', providerAccountId: sub } },
    select: { userId: true },
  });
  if (account) return { id: account.userId };

  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email }, select: { id: true, emailVerified: true } });
    if (user && !user.emailVerified) {
      // The existing account's email was never proven. Google has now proven
      // ownership, so anyone who registered this address without owning it is
      // locked out: drop their password and sessions before linking.
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: null, emailVerified: new Date() } });
      await tx.session.deleteMany({ where: { userId: user.id } });
    }
    if (!user) {
      user = await tx.user.create({
        data: { email, name: name || null, avatarUrl: picture || null, emailVerified: new Date() },
        select: { id: true },
      });
    }
    await tx.oAuthAccount.create({ data: { userId: user.id, provider: 'google', providerAccountId: sub } });
    return user;
  });
}
