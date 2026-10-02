// The owner sign-in steps, kept free of Next so they can be tested with a
// fake Tower. The route (app/api/studio-auth/login/route.js) supplies fetch,
// the Tower auth config and the session secret, and turns the result into a
// response and cookie.
//
// Steps: password grant -> the account's verified authenticator -> challenge
// -> verify the 6-digit code -> read the user with the stronger session ->
// require app_metadata.platform_owner === true (the claim the Tower's
// is_platform_owner() reads). Each Tower session this opens is signed out
// again. Refusals share one wording so the form never says which part was
// wrong.

import { signSession } from './studio-session.js';

export const GENERIC_REFUSAL = 'That email, password or code is not right.';
const UNREACHABLE = 'The Tower could not be reached. Try again.';
const TIMEOUT_MS = 10_000;

// Xaen Tower's auth address and publishable key. Both are public by design
// (the Tower console ships them in its own pages); the env vars override them.
const TOWER_URL = 'https://gbaevzengjcfvedkrvqs.supabase.co';
const TOWER_PUBLISHABLE_KEY = 'sb_publishable_-4hvvN7rVFCnXxSkQCovJQ_ny7ovQEz';

export function towerAuthConfig(env = process.env) {
  const url = env.XAEN_SUPABASE_URL || TOWER_URL;
  const key = env.XAEN_SUPABASE_PUBLISHABLE_KEY || TOWER_PUBLISHABLE_KEY;
  if (typeof url !== 'string' || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) return null;
  if (typeof key !== 'string' || key.length < 20) return null;
  return { url, key };
}

export function readCredentials(body) {
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const code = typeof body?.code === 'string' ? body.code.replace(/\s+/g, '') : '';
  if (!email || email.length > 254 || !password || password.length > 256 || !/^\d{6}$/.test(code)) return null;
  return { email, password, code };
}

async function call(fetchImpl, config, path, { method = 'POST', token, body } = {}) {
  const headers = { apikey: config.key, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetchImpl(`${config.url}/auth/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

const unreachable = (status) => status === 0 || status >= 500;

// Returns { status, error } on refusal or { status: 200, cookie } on success.
export async function ownerSignIn({ credentials, config, secret, fetchImpl = fetch, now = Date.now() }) {
  if (!secret || !config) return { status: 503, error: 'Sign-in is not configured on this studio.' };
  if (!credentials) return { status: 400, error: 'Enter your email, password and the 6-digit code from your authenticator.' };
  const signOut = async (token) => { if (token) await call(fetchImpl, config, '/logout?scope=local', { token }); };

  const signIn = await call(fetchImpl, config, '/token?grant_type=password', {
    body: { email: credentials.email, password: credentials.password },
  });
  const firstToken = signIn.data?.access_token;
  if (!signIn.ok || typeof firstToken !== 'string') {
    if (unreachable(signIn.status)) return { status: 503, error: UNREACHABLE };
    if (signIn.status === 429) return { status: 429, error: 'Too many attempts. Wait a few minutes and try again.' };
    // The Tower answers 400 for wrong credentials; 401/403 mean it refused the
    // studio's own key, which is a setup fault, not the owner's.
    if (signIn.status === 401 || signIn.status === 403) return { status: 503, error: 'Sign-in is not configured on this studio.' };
    return { status: 401, error: GENERIC_REFUSAL };
  }

  // Every refusal after the password step reads the same 401, so the form
  // never confirms that a password was right for an account without an
  // authenticator or outside the owner role.
  const factors = (Array.isArray(signIn.data?.user?.factors) ? signIn.data.user.factors : [])
    .filter((f) => f?.factor_type === 'totp' && f?.status === 'verified' && typeof f?.id === 'string')
    .slice(0, 10);
  if (factors.length === 0) {
    await signOut(firstToken);
    return { status: 401, error: GENERIC_REFUSAL };
  }

  // The code may belong to any of the account's authenticators: try each in
  // turn and stop at the first that accepts it.
  let strongToken = null;
  for (const factor of factors) {
    const factorPath = `/factors/${encodeURIComponent(factor.id)}`;
    const challenge = await call(fetchImpl, config, `${factorPath}/challenge`, { token: firstToken, body: {} });
    if (!challenge.ok || typeof challenge.data?.id !== 'string') {
      if (unreachable(challenge.status)) {
        await signOut(firstToken);
        return { status: 503, error: UNREACHABLE };
      }
      continue;
    }
    const verified = await call(fetchImpl, config, `${factorPath}/verify`, {
      token: firstToken,
      body: { challenge_id: challenge.data.id, code: credentials.code },
    });
    if (verified.ok && typeof verified.data?.access_token === 'string') {
      strongToken = verified.data.access_token;
      break;
    }
    if (unreachable(verified.status)) {
      await signOut(firstToken);
      return { status: 503, error: UNREACHABLE };
    }
  }
  if (!strongToken) {
    await signOut(firstToken);
    return { status: 401, error: GENERIC_REFUSAL };
  }

  const who = await call(fetchImpl, config, '/user', { method: 'GET', token: strongToken });
  await signOut(strongToken);
  if (!who.ok || typeof who.data?.id !== 'string') return { status: 503, error: UNREACHABLE };
  if (who.data.app_metadata?.platform_owner !== true) return { status: 401, error: GENERIC_REFUSAL };

  const cookie = await signSession({ sub: who.data.id, now }, secret);
  if (!cookie) return { status: 503, error: 'Sign-in is not configured on this studio.' };
  return { status: 200, cookie };
}
