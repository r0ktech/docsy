import 'server-only';
import { createHash } from 'node:crypto';
import { getConfig } from '@/server/config';
import { Errors } from '@/server/errors';
import { randomToken } from '@/server/crypto';

/**
 * Google OAuth 2.0 / OpenID Connect (authorization code flow with PKCE).
 * Implemented directly against Google's documented endpoints. The ID token is
 * received over a direct TLS connection to Google's token endpoint, and the
 * profile is read from the userinfo endpoint with the access token.
 */
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export function googleConfigured() {
  const c = getConfig();
  return Boolean(c.GOOGLE_CLIENT_ID && c.GOOGLE_CLIENT_SECRET);
}

export function redirectUri() {
  return `${getConfig().APP_URL}/api/auth/google/callback`;
}

export function createAuthorizationRequest() {
  const c = getConfig();
  if (!googleConfigured()) throw Errors.unavailable('GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured on this deployment.');
  const state = randomToken(24);
  const codeVerifier = randomToken(48);
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: c.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return { url: url.toString(), state, codeVerifier };
}

export async function exchangeCodeForProfile(code, codeVerifier) {
  const c = getConfig();
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.GOOGLE_CLIENT_ID,
      client_secret: c.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  });
  if (!tokenRes.ok) throw Errors.validation('Google sign-in failed. Please try again.');
  const tokens = await tokenRes.json();

  const profileRes = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!profileRes.ok) throw Errors.validation('Could not read your Google profile. Please try again.');
  const p = await profileRes.json();
  if (!p.sub || !p.email) throw Errors.validation('Google did not return an email address.');
  return {
    sub: String(p.sub),
    email: String(p.email).toLowerCase(),
    emailVerified: p.email_verified === true || p.email_verified === 'true',
    name: p.name,
    picture: p.picture,
  };
}
