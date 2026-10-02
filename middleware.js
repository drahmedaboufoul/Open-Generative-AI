import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionSecret, verifySession, safeNextPath } from './lib/studio-session.js';

function addSecurityHeaders(response) {
    // Prevent MIME type sniffing (CWE-693)
    response.headers.set('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking (CWE-1021)
    response.headers.set('X-Frame-Options', 'DENY');
    // Enable XSS filter in legacy browsers
    response.headers.set('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Content Security Policy - restricts script sources to prevent XSS (CWE-79).
    // connect-src covers *.muapi.ai (not just api.muapi.ai) because generated
    // media, model thumbnails, and other assets are served from cdn.muapi.ai
    // and other muapi subdomains that the renderer fetches directly.
    response.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https://muapi.ai https://*.muapi.ai; font-src 'self' data:;"
    );
    return response;
}

// The sign-in page and its two routes are the only paths open without a
// studio session. Everything else, pages and every /api route that injects the
// server's MuAPI or Featherless key, needs the owner's signed cookie.
const PUBLIC_PATHS = new Set(['/login', '/api/studio-auth/login', '/api/studio-auth/logout']);

function refuse(request, status, error) {
    const isApi = request.nextUrl.pathname.startsWith('/api/');
    if (isApi) {
        return addSecurityHeaders(NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } }));
    }
    const login = new URL('/login', request.url);
    const next = safeNextPath(request.nextUrl.pathname + request.nextUrl.search);
    if (next !== '/studio') login.searchParams.set('next', next);
    return addSecurityHeaders(NextResponse.redirect(login, 307));
}

export async function middleware(request) {
    const url = request.nextUrl;

    if (!PUBLIC_PATHS.has(url.pathname)) {
        const secret = sessionSecret();
        if (!secret) return refuse(request, 503, 'Sign-in is not configured on this studio.');
        const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret);
        if (!session) return refuse(request, 401, 'Sign in to use the studio.');
    }

    // Catch requests to /api/workflow, /api/app, and /api/v1
    const isMuApi = url.pathname.startsWith('/api/workflow') ||
                    url.pathname.startsWith('/api/app') ||
                    url.pathname.startsWith('/api/v1');

    if (isMuApi) {
        // Exclude paths that have their own dedicated route handlers with custom logic
        const isHandledByRoute = url.pathname.startsWith('/api/v1/creative-agent') ||
                                url.pathname.startsWith('/api/v1/get_upload_url') ||
                                url.pathname.startsWith('/api/v1/upload-binary');

        if (url.pathname.startsWith('/api/v1') && !isHandledByRoute) {
            const targetUrl = new URL(url.pathname + url.search, 'https://api.muapi.ai');
            // Tower deployment (managed mode): when MUAPI_API_KEY is set on the server we
            // inject it here so the key is never sent to the browser and no user has to
            // paste one. The server key wins over any client-supplied x-api-key. When
            // unset, requests pass through with whatever the client sent (BYO-key / dev).
            const serverKey = process.env.MUAPI_API_KEY;
            let rewriteResponse;
            if (serverKey) {
                const requestHeaders = new Headers(request.headers);
                requestHeaders.set('x-api-key', serverKey);
                rewriteResponse = NextResponse.rewrite(targetUrl, { request: { headers: requestHeaders } });
            } else {
                rewriteResponse = NextResponse.rewrite(targetUrl);
            }
            return addSecurityHeaders(rewriteResponse);
        }
    }

    // Add security headers to all responses
    return addSecurityHeaders(NextResponse.next());
}

// Match all paths for security headers. Exclude Next.js internal paths.
export const config = {
    matcher: [
        '/api/:path*',
        '/((?!_next/static|_next/image|favicon.ico|__nextjs_original-stack-frame).*)',
    ],
};
