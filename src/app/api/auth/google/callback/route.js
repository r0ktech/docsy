import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { exchangeCodeForProfile } from '@/server/auth/google';
import { findOrCreateGoogleUser } from '@/server/services/auth';
import { createSession } from '@/server/auth/session';
import { getConfig } from '@/server/config';
import { safeEqual } from '@/server/crypto';
import { log } from '@/server/log';

export async function GET(request) {
  const appUrl = getConfig().APP_URL;
  const params = new URL(request.url).searchParams;
  const jar = await cookies();
  const expectedState = jar.get('docsy_oauth_state')?.value;
  const verifier = jar.get('docsy_oauth_verifier')?.value;
  const next = jar.get('docsy_oauth_next')?.value || '/app';
  for (const name of ['docsy_oauth_state', 'docsy_oauth_verifier', 'docsy_oauth_next']) jar.delete(name);

  const code = params.get('code');
  const state = params.get('state');
  if (params.get('error') || !code || !state || !expectedState || !verifier || !safeEqual(state, expectedState)) {
    return NextResponse.redirect(`${appUrl}/sign-in?error=google_failed`);
  }

  try {
    const profile = await exchangeCodeForProfile(code, verifier);
    const user = await findOrCreateGoogleUser(profile);
    await createSession(user.id);
    return NextResponse.redirect(`${appUrl}${next.startsWith('/') && !next.startsWith('//') ? next : '/app'}`);
  } catch (err) {
    log.warn('Google sign-in failed', { err });
    return NextResponse.redirect(`${appUrl}/sign-in?error=google_failed`);
  }
}
