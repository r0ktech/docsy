import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAuthorizationRequest, googleConfigured } from '@/server/auth/google';
import { getConfig } from '@/server/config';

export async function GET(request) {
  const appUrl = getConfig().APP_URL;
  if (!googleConfigured()) {
    return NextResponse.redirect(`${appUrl}/sign-in?error=google_not_configured`);
  }
  const { url, state, codeVerifier } = createAuthorizationRequest();
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  const jar = await cookies();
  const opts = { httpOnly: true, secure: appUrl.startsWith('https://'), sameSite: 'lax', path: '/', maxAge: 600 };
  jar.set('docsy_oauth_state', state, opts);
  jar.set('docsy_oauth_verifier', codeVerifier, opts);
  jar.set('docsy_oauth_next', next, opts);
  return NextResponse.redirect(url);
}

function safeNext(value) {
  // Only allow same-site relative paths to prevent open redirects.
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/app';
}
