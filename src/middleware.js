import { NextResponse } from 'next/server';

/**
 * Optimistic gate for the app: if there's no session cookie at all, redirect
 * to sign-in before rendering. This is a UX shortcut only — every page and API
 * route still validates the session and ownership on the server.
 */
export function middleware(request) {
  const hasSession =
    request.cookies.has('__Host-docsy_session') || request.cookies.has('docsy_session');
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/app/:path*'] };
