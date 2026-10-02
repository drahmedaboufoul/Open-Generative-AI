import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sameSiteRequest } from '@/lib/studio-session';

export const dynamic = 'force-dynamic';

// Clears this browser's studio session. Another site cannot sign the owner
// out. The cookie is stateless: to end every session at once, change
// STUDIO_SESSION_EPOCH (or STUDIO_SESSION_SECRET) on the server.
export async function POST(request) {
  if (!sameSiteRequest(request.headers)) {
    return NextResponse.json({ ok: false, error: 'Sign out from the studio itself.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
