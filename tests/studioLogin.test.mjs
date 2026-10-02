import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerSignIn, readCredentials, towerAuthConfig, GENERIC_REFUSAL } from '../lib/studio-login.js';
import { verifySession } from '../lib/studio-session.js';

const SECRET = 's'.repeat(48);
const CONFIG = { url: 'https://example.supabase.co', key: 'sb_publishable_test_key_000' };
const CREDS = { email: 'owner@example.com', password: 'pw', code: '123456' };

// A fake Tower auth: each path answers from the script; every call is logged.
function fakeTower(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = url.replace(`${CONFIG.url}/auth/v1`, '');
    calls.push({ path, method: init.method, auth: init.headers.Authorization || null, body: init.body ? JSON.parse(init.body) : null });
    const key = Object.keys(script).find((k) => path.startsWith(k));
    const answer = key ? script[key] : { status: 404, body: {} };
    if (answer === 'throw') throw new Error('network');
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body };
  };
  return { fetchImpl, calls };
}

const ownerScript = (overrides = {}) => ({
  '/token': { status: 200, body: { access_token: 'aal1', user: { factors: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] } } },
  '/factors/f1/challenge': { status: 200, body: { id: 'c1' } },
  '/factors/f1/verify': { status: 200, body: { access_token: 'aal2' } },
  '/user': { status: 200, body: { id: 'owner-uuid', app_metadata: { platform_owner: true } } },
  '/logout': { status: 204, body: null },
  ...overrides,
});

test('the platform owner with password and code gets a valid session', async () => {
  const { fetchImpl, calls } = fakeTower(ownerScript());
  const result = await ownerSignIn({ credentials: CREDS, config: CONFIG, secret: SECRET, fetchImpl });
  assert.equal(result.status, 200);
  assert.equal((await verifySession(result.cookie, SECRET)).sub, 'owner-uuid');
  assert.deepEqual(calls.map((c) => c.path), ['/token?grant_type=password', '/factors/f1/challenge', '/factors/f1/verify', '/user', '/logout?scope=local']);
  assert.equal(calls[2].body.code, '123456');
  assert.equal(calls[3].auth, 'Bearer aal2', 'the user is read with the verified session');
  assert.equal(calls[4].auth, 'Bearer aal2', 'the Tower session is signed out again');
});

test('a wrong password is refused without saying which part was wrong', async () => {
  const { fetchImpl } = fakeTower(ownerScript({ '/token': { status: 400, body: { error: 'invalid_grant' } } }));
  assert.deepEqual(await ownerSignIn({ credentials: CREDS, config: CONFIG, secret: SECRET, fetchImpl }), { status: 401, error: GENERIC_REFUSAL });
});

test('a Tower that refuses the studio key reads as a setup fault, not a wrong password', async () => {
  const { fetchImpl } = fakeTower(ownerScript({ '/token': { status: 401, body: { message: 'Invalid API key' } } }));
  assert.equal((await ownerSignIn({ credentials: CREDS, config: CONFIG, secret: SECRET, fetchImpl })).status, 503);
});

test('a wrong code is refused and the half-open session is signed out', async () => {
  const { fetchImpl, calls } = fakeTower(ownerScript({ '/factors/f1/verify': { status: 422, body: {} } }));
  const result = await ownerSignIn({ credentials: CREDS, config: CONFIG, secret: SECRET, fetchImpl });
  assert.deepEqual(result, { status: 401, error: GENERIC_REFUSAL });
  assert.equal(calls.at(-1).path, '/logout?scope=local');
  assert.equal(calls.at(-1).auth, 'Bearer aal1');
});

test('an account without a verified authenticator is refused', async () => {
  for (const factors of [[], [{ id: 'f1', factor_type: 'totp', status: 'unverified' }], [{ id: 'p1', factor_type: 'phone', status: 'verified' }], undefined]) {
    const { fetchImpl, calls } = fakeTower(ownerScript({ '/token': { status: 200, body: { access_token: 'aal1', user: { factors } } } }));
    const result = await ownerSignIn({ credentials: CREDS, config: CONFIG, secret: SECRET, fetchImpl });
    assert.equal(result.status, 403);
    assert.equal(result.cookie, undefined);
    assert.equal(calls.at(-1).path, '/logout?scope=local');
  }
});

test('any account that is not the platform owner is refused', async () => {
  for (const app_metadata of [{}, { platform_owner: 'true' }, { platform_owner: false }, undefined]) {
    const { fetchImpl } = fakeTower(ownerScript({ '/user': { status: 200, body: { id: 'staff-uuid', app_metadata } } }));
    const result = await ownerSignIn({ credentials: CREDS, config: CONFIG, secret: SECRET, fetchImpl });
    assert.deepEqual(result, { status: 403, error: GENERIC_REFUSAL });
  }
});

test('without a secret or Tower config nothing is attempted', async () => {
  const { fetchImpl, calls } = fakeTower(ownerScript());
  assert.equal((await ownerSignIn({ credentials: CREDS, config: CONFIG, secret: null, fetchImpl })).status, 503);
  assert.equal((await ownerSignIn({ credentials: CREDS, config: null, secret: SECRET, fetchImpl })).status, 503);
  assert.equal(calls.length, 0);
});

test('an unreachable Tower reads as unavailable, never as signed in', async () => {
  for (const broken of [{ '/token': 'throw' }, { '/token': { status: 500, body: {} } }, { '/factors/f1/challenge': 'throw' }, { '/user': 'throw' }]) {
    const { fetchImpl } = fakeTower(ownerScript(broken));
    const result = await ownerSignIn({ credentials: CREDS, config: CONFIG, secret: SECRET, fetchImpl });
    assert.equal(result.status, 503);
    assert.equal(result.cookie, undefined);
  }
});

test('input and config are validated before any call', () => {
  assert.equal(readCredentials({ email: 'a@b.c', password: 'x', code: '12345' }), null);
  assert.equal(readCredentials({ email: 'a@b.c', password: 'x', code: 'abcdef' }), null);
  assert.equal(readCredentials({ email: '', password: 'x', code: '123456' }), null);
  assert.deepEqual(readCredentials({ email: ' a@b.c ', password: 'x', code: '123 456' }), { email: 'a@b.c', password: 'x', code: '123456' });
  assert.equal(towerAuthConfig({ XAEN_SUPABASE_URL: 'http://example.supabase.co', XAEN_SUPABASE_PUBLISHABLE_KEY: 'k'.repeat(30) }), null);
  assert.equal(towerAuthConfig({ XAEN_SUPABASE_URL: 'https://evil.example.com', XAEN_SUPABASE_PUBLISHABLE_KEY: 'k'.repeat(30) }), null);
  assert.deepEqual(towerAuthConfig({ XAEN_SUPABASE_URL: 'https://abc.supabase.co', XAEN_SUPABASE_PUBLISHABLE_KEY: 'k'.repeat(30) }), { url: 'https://abc.supabase.co', key: 'k'.repeat(30) });
  const defaults = towerAuthConfig({});
  assert.equal(defaults.url, 'https://gbaevzengjcfvedkrvqs.supabase.co', 'defaults to the Tower');
  assert.match(defaults.key, /^sb_publishable_/, 'only the publishable key is built in');
});
