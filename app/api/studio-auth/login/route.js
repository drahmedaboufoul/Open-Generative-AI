import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, sameSiteRequest, sessionSecret } from '@/lib/studio-session';
import { ownerSignIn, readCredentials, towerAuthConfig } from '@/lib/studio-login';
import { clientAddress, createAttemptLimiter } from '@/lib/studio-attempts';

// Owner sign-in for the hosted studio. The checks live in lib/studio-login.js:
// Xaen Tower verifies password and authenticator code, and only the platform
// owner gets the studio's signed session cookie.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowAttempt = createAttemptLimiter();

function refuse(status, error) {
  return NextResponse.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  if (!sameSiteRequest(request.headers)) return refuse(403, 'Sign in from the studio itself.');
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return refuse(415, 'Sign in from the studio itself.');
  }
  if (!allowAttempt(clientAddress(request.headers))) {
    return refuse(429, 'Too many attempts. Wait a minute and try again.');
  }
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const result = await ownerSignIn({
    credentials: readCredentials(body),
    config: towerAuthConfig(),
    secret: sessionSecret(),
  });
  if (result.status !== 200) return refuse(result.status, result.error);
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(SESSION_COOKIE, result.cookie, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_SECONDS });
  return res;
}
