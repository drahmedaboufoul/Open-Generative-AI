import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, sessionSecret } from '@/lib/studio-session';
import { ownerSignIn, readCredentials, towerAuthConfig } from '@/lib/studio-login';

// Owner sign-in for the hosted studio. The checks live in lib/studio-login.js:
// Xaen Tower verifies password and authenticator code, and only the platform
// owner gets the studio's signed session cookie.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const result = await ownerSignIn({
    credentials: readCredentials(body),
    config: towerAuthConfig(),
    secret: sessionSecret(),
  });
  if (result.status !== 200) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  }
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(SESSION_COOKIE, result.cookie, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_SECONDS });
  return res;
}
