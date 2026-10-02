// Owner-only sign-in for the hosted studio.
//
// The studio runs every generation on the group's own MuAPI and Featherless
// keys, injected on the server (middleware.js and the app/api route handlers).
// Without a sign-in, anyone who found the address could spend that credit.
// This module signs and checks the session cookie the sign-in route sets
// after Xaen Tower confirms the platform owner with password and
// authenticator code (app/api/studio-auth/login/route.js).
//
// It runs in the Edge middleware and in Node route handlers, so it uses Web
// Crypto only.
//
// The signing key is STUDIO_SESSION_SECRET when it is set (32+ characters).
// Without it, the key comes from the server's own MUAPI_API_KEY (20+
// characters) under a fixed label, so no new secret has to be created: a
// forger would need the very key the sign-in protects. With neither, nothing
// can be signed or verified and the studio stays locked.

export const SESSION_COOKIE = 'xaen_studio_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
const MIN_SECRET_LENGTH = 32;
const MIN_DERIVED_SOURCE_LENGTH = 20;
const DERIVED_LABEL = 'xaen-studio-session-v1:';

const encoder = new TextEncoder();

export function sessionSecret(env = process.env) {
  const secret = env.STUDIO_SESSION_SECRET;
  if (typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH) return secret;
  const serverKey = env.MUAPI_API_KEY;
  if (typeof serverKey === 'string' && serverKey.trim().length >= MIN_DERIVED_SOURCE_LENGTH) return DERIVED_LABEL + serverKey.trim();
  return null;
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret, usage) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

// Returns the cookie value, or null when no usable secret is configured.
export async function signSession({ sub, now = Date.now() }, secret) {
  if (!secret || typeof sub !== 'string' || !sub) return null;
  const payload = { v: 1, sub, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(body)));
  return `${body}.${toBase64Url(signature)}`;
}

// Returns the session payload when the cookie is authentic and unexpired,
// otherwise null. crypto.subtle.verify compares in constant time.
export async function verifySession(value, secret, now = Date.now()) {
  if (!secret || typeof value !== 'string' || value.length > 2048) return null;
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const [body, signaturePart] = parts;
  const signature = fromBase64Url(signaturePart);
  const bodyBytes = fromBase64Url(body);
  if (!signature || !bodyBytes) return null;
  let valid = false;
  try {
    valid = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), signature, encoder.encode(body));
  } catch {
    return null;
  }
  if (!valid) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return null;
  }
  if (payload?.v !== 1 || typeof payload.sub !== 'string' || !Number.isInteger(payload.exp)) return null;
  if (payload.exp <= Math.floor(now / 1000)) return null;
  return payload;
}

// Only same-site paths are allowed as a post-login destination.
export function safeNextPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/studio';
  if (value.startsWith('/login') || value.startsWith('/api/')) return '/studio';
  return value.length > 512 ? '/studio' : value;
}
