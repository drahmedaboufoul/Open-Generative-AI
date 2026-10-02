import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sessionSecret, signSession, verifySession, safeNextPath, sameSiteRequest, SESSION_TTL_SECONDS } from '../lib/studio-session.js';
import { createAttemptLimiter, clientAddress } from '../lib/studio-attempts.js';

const SECRET = 'x'.repeat(48);
const OTHER = 'y'.repeat(48);

test('a missing or short secret locks the studio', () => {
  assert.equal(sessionSecret({}), null);
  assert.equal(sessionSecret({ STUDIO_SESSION_SECRET: 'short' }), null);
  assert.equal(sessionSecret({ STUDIO_SESSION_SECRET: 'z'.repeat(31) }), null);
  assert.equal(sessionSecret({ STUDIO_SESSION_SECRET: SECRET }), SECRET);
  assert.equal(sessionSecret({ MUAPI_API_KEY: 'k'.repeat(19) }), null, 'a short server key is not enough');
});

test('without its own secret the key derives from the server MuAPI key, never equal to it', async () => {
  const key = 'm'.repeat(40);
  const derived = sessionSecret({ MUAPI_API_KEY: key });
  assert.ok(derived && derived !== key && derived.endsWith(key));
  assert.equal(sessionSecret({ MUAPI_API_KEY: key, STUDIO_SESSION_SECRET: SECRET }), SECRET, 'an explicit secret wins');
  const cookie = await signSession({ sub: 'owner-id' }, derived);
  assert.equal((await verifySession(cookie, derived)).sub, 'owner-id');
  assert.equal(await verifySession(cookie, sessionSecret({ MUAPI_API_KEY: 'n'.repeat(40) })), null, 'another server key cannot verify it');
});

test('a signed session verifies and carries the user id', async () => {
  const now = Date.UTC(2026, 9, 2, 12);
  const cookie = await signSession({ sub: 'owner-id', now }, SECRET);
  const session = await verifySession(cookie, SECRET, now + 1000);
  assert.equal(session.sub, 'owner-id');
  assert.equal(session.exp, Math.floor(now / 1000) + SESSION_TTL_SECONDS);
});

test('nothing is signed without a secret or a user id', async () => {
  assert.equal(await signSession({ sub: 'owner-id' }, null), null);
  assert.equal(await signSession({ sub: '' }, SECRET), null);
});

test('forged, tampered, expired and foreign sessions are refused', async () => {
  const now = Date.UTC(2026, 9, 2, 12);
  const cookie = await signSession({ sub: 'owner-id', now }, SECRET);
  const [body, sig] = cookie.split('.');
  assert.equal(await verifySession(cookie, OTHER, now), null, 'another secret');
  assert.equal(await verifySession(cookie, null, now), null, 'no secret');
  assert.equal(await verifySession(`${body}.${sig.slice(0, -2)}AA`, SECRET, now), null, 'altered signature');
  const forgedBody = Buffer.from(JSON.stringify({ v: 1, sub: 'someone-else', exp: 9999999999 })).toString('base64url');
  assert.equal(await verifySession(`${forgedBody}.${sig}`, SECRET, now), null, 'swapped body');
  assert.equal(await verifySession(cookie, SECRET, now + (SESSION_TTL_SECONDS + 1) * 1000), null, 'expired');
  for (const junk of [undefined, '', 'abc', 'a.b.c', '.', `${body}.`, `${body}.!!!`, 'x'.repeat(5000)]) {
    assert.equal(await verifySession(junk, SECRET, now), null, `junk ${String(junk).slice(0, 12)}`);
  }
});

test('only same-site paths survive as the post-login destination', () => {
  assert.equal(safeNextPath('/studio/video'), '/studio/video');
  assert.equal(safeNextPath('/workflow/abc?tab=x#y'), '/workflow/abc?tab=x#y');
  assert.equal(safeNextPath('/studio', 'https://studio.example'), '/studio');
  const bad = ['https://evil.example', '//evil.example', '/\\evil.example', '/x\\y', '/login', '/api/v1/x', '', null, 'studio',
    '/\t/evil.example', '/\n/evil.example', '/\r/evil.example/x', '/\u0000/evil.example'];
  for (const value of bad) {
    assert.equal(safeNextPath(value, 'https://studio.example'), '/studio', JSON.stringify(value));
  }
  // The browser drops tabs and line breaks before resolving: the guard must
  // never return a value that resolves off-origin.
  for (const value of bad.filter((v) => typeof v === 'string')) {
    const resolved = new URL(safeNextPath(value, 'https://studio.example'), 'https://studio.example');
    assert.equal(resolved.origin, 'https://studio.example', JSON.stringify(value));
  }
});

test('the epoch setting signs every session out', async () => {
  const key = 'm'.repeat(40);
  const before = sessionSecret({ MUAPI_API_KEY: key });
  const after = sessionSecret({ MUAPI_API_KEY: key, STUDIO_SESSION_EPOCH: '2026-10-02' });
  assert.notEqual(before, after);
  const cookie = await signSession({ sub: 'owner-id' }, before);
  assert.equal(await verifySession(cookie, after), null);
  assert.equal(SESSION_TTL_SECONDS, 4 * 60 * 60);
});

test('sign-in and sign-out refuse requests started by another site', () => {
  const h = (o) => new Headers(o);
  assert.equal(sameSiteRequest(h({})), true, 'no browser headers (curl)');
  assert.equal(sameSiteRequest(h({ 'sec-fetch-site': 'same-origin', origin: 'https://studio.example', host: 'studio.example' })), true);
  assert.equal(sameSiteRequest(h({ 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(sameSiteRequest(h({ 'sec-fetch-site': 'same-site' })), false);
  assert.equal(sameSiteRequest(h({ origin: 'https://evil.example', host: 'studio.example' })), false);
  assert.equal(sameSiteRequest(h({ origin: 'https://studio.example', 'x-forwarded-host': 'studio.example', host: 'internal' })), true);
  assert.equal(sameSiteRequest(h({ origin: 'null', host: 'studio.example' })), false);
});

test('the attempt cap allows five tries a minute per address', () => {
  const allow = createAttemptLimiter({ limit: 5, windowMs: 60_000 });
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i += 1) assert.equal(allow('1.2.3.4', t0 + i), true);
  assert.equal(allow('1.2.3.4', t0 + 10), false);
  assert.equal(allow('5.6.7.8', t0 + 10), true, 'another address is separate');
  assert.equal(allow('1.2.3.4', t0 + 60_000), true, 'a new window opens');
  assert.equal(clientAddress(new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' })), '9.9.9.9');
});

test('the middleware gates every path except sign-in, and before the MuAPI rewrite', () => {
  const source = readFileSync(new URL('../middleware.js', import.meta.url), 'utf8');
  assert.match(source, /const PUBLIC_PATHS = new Set\(\['\/login', '\/api\/studio-auth\/login', '\/api\/studio-auth\/logout'\]\);/);
  const gate = source.indexOf('if (!PUBLIC_PATHS.has(url.pathname))');
  const rewrite = source.indexOf("requestHeaders.set('x-api-key', serverKey)");
  assert.ok(gate > 0 && rewrite > gate, 'the session check runs before the key is injected');
  assert.match(source, /if \(!secret\) return refuse\(request, 503/);
  assert.match(source, /'\/api\/:path\*'/, 'every /api path stays inside the matcher');
});
