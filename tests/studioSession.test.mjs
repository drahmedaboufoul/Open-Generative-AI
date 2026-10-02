import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sessionSecret, signSession, verifySession, safeNextPath, SESSION_TTL_SECONDS } from '../lib/studio-session.js';

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
  assert.equal(safeNextPath('/workflow/abc?tab=x'), '/workflow/abc?tab=x');
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', '/login', '/api/v1/x', '', null, 'studio']) {
    assert.equal(safeNextPath(bad), '/studio', String(bad));
  }
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
