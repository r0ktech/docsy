import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { POST as signUp } from '@/app/api/auth/sign-up/route';
import { POST as signIn } from '@/app/api/auth/sign-in/route';
import { POST as signOut } from '@/app/api/auth/sign-out/route';
import { POST as forgot } from '@/app/api/auth/forgot-password/route';
import { POST as reset } from '@/app/api/auth/reset-password/route';
import { GET as listDocs } from '@/app/api/documents/route';
import { getSessionUser } from '@/server/auth/session';
import { requestPasswordReset, findOrCreateGoogleUser } from '@/server/services/auth';
import { sha256 } from '@/server/crypto';
import { resetDb, jsonRequest, createUser, signInAs, sessionToken } from '../setup/helpers';

beforeEach(resetDb);

describe('sign-up and sign-in', () => {
  it('creates an account, hashes the password with Argon2id and starts a session', async () => {
    const res = await signUp(jsonRequest('/api/auth/sign-up', { method: 'POST', body: { name: 'Ada', email: 'Ada@Example.com', password: 'correct horse battery' } }));
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain('correct horse');
    const session = await prisma.session.findFirst({ where: { userId: user.id } });
    expect(session.tokenHash).toBe(sha256(sessionToken()));
    expect((await getSessionUser()).id).toBe(user.id);
  });

  it('rejects duplicate emails', async () => {
    await createUser({ email: 'dup@example.com' });
    const res = await signUp(jsonRequest('/api/auth/sign-up', { method: 'POST', body: { name: 'B', email: 'dup@example.com', password: 'another password' } }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('EMAIL_IN_USE');
  });

  it('rejects wrong passwords without revealing whether the email exists', async () => {
    await createUser({ email: 'real@example.com', password: 'the right password' });
    const wrong = await signIn(jsonRequest('/api/auth/sign-in', { method: 'POST', body: { email: 'real@example.com', password: 'nope nope nope' } }));
    const missing = await signIn(jsonRequest('/api/auth/sign-in', { method: 'POST', body: { email: 'ghost@example.com', password: 'nope nope nope' } }));
    expect(wrong.status).toBe(422);
    expect((await wrong.json()).error.message).toBe((await missing.json()).error.message);
  });

  it('rate-limits repeated sign-in attempts for one account', async () => {
    await createUser({ email: 'target@example.com' });
    let last;
    for (let i = 0; i < 11; i++) {
      last = await signIn(jsonRequest('/api/auth/sign-in', { method: 'POST', body: { email: 'target@example.com', password: 'guess guess guess' } }));
    }
    expect(last.status).toBe(429);
    expect(last.headers.get('Retry-After')).toBeTruthy();
  });

  it('signs out by deleting the server-side session', async () => {
    const user = await createUser();
    await signInAs(user);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    await signOut(jsonRequest('/api/auth/sign-out', { method: 'POST' }));
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await getSessionUser()).toBeNull();
  });

  it('treats expired sessions as signed out', async () => {
    const user = await createUser();
    await signInAs(user);
    await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getSessionUser()).toBeNull();
    const res = await listDocs(jsonRequest('/api/documents'));
    expect(res.status).toBe(401);
  });
});

describe('protected routes and CSRF', () => {
  it('requires a session for private APIs', async () => {
    const res = await listDocs(jsonRequest('/api/documents'));
    expect(res.status).toBe(401);
  });

  it('blocks cross-site mutations even with a valid session', async () => {
    const user = await createUser();
    await signInAs(user);
    const res = await signOut(jsonRequest('/api/auth/sign-out', { method: 'POST', origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it('never exposes internals in error responses', async () => {
    const res = await signUp(new Request('http://localhost:3000/api/auth/sign-up', { method: 'POST', headers: { Origin: 'http://localhost:3000' }, body: '{bad json' }));
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(JSON.stringify(body)).not.toMatch(/stack|prisma|at \w+ \(/i);
  });
});

describe('password reset', () => {
  it('resets the password with a single-use token and revokes other sessions', async () => {
    const user = await createUser({ email: 'reset@example.com', password: 'old password value' });
    await signInAs(user);
    await requestPasswordReset('reset@example.com');
    const record = await prisma.passwordResetToken.findFirst({ where: { userId: user.id } });
    expect(record).toBeTruthy();

    // The raw token is only ever sent by email; simulate it by issuing a known one.
    const token = 'known-reset-token-for-testing-0123456789';
    await prisma.passwordResetToken.update({ where: { id: record.id }, data: { tokenHash: sha256(token) } });

    const res = await reset(jsonRequest('/api/auth/reset-password', { method: 'POST', body: { token, password: 'brand new password' } }));
    expect(res.status).toBe(200);
    // Old session revoked, a fresh one issued.
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);

    const again = await reset(jsonRequest('/api/auth/reset-password', { method: 'POST', body: { token, password: 'another new password' } }));
    expect(again.status).toBe(422);
  });

  it('responds identically for unknown emails', async () => {
    const res = await forgot(jsonRequest('/api/auth/forgot-password', { method: 'POST', body: { email: 'nobody@example.com' } }));
    expect(res.status).toBe(200);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });
});

describe('Google account linking', () => {
  it('locks out an unverified password account when the real owner signs in with Google', async () => {
    const squatter = await createUser({ email: 'owner@example.com', password: 'squatter password' });
    await signInAs(squatter);
    const linked = await findOrCreateGoogleUser({ sub: 'g-123', email: 'owner@example.com', emailVerified: true, name: 'Owner' });
    expect(linked.id).toBe(squatter.id);
    const user = await prisma.user.findUnique({ where: { id: squatter.id } });
    expect(user.passwordHash).toBeNull();
    expect(user.emailVerified).toBeTruthy();
    expect(await prisma.session.count({ where: { userId: squatter.id } })).toBe(0);
  });

  it('refuses unverified Google emails', async () => {
    await expect(findOrCreateGoogleUser({ sub: 'g-9', email: 'x@example.com', emailVerified: false })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
