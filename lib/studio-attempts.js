// A best-effort cap on sign-in attempts per client address, kept in memory by
// each server instance. It slows a guessing run and keeps it from spending the
// Tower's own sign-in limit, which the owner shares. It is not a guarantee
// across instances; a Vercel Firewall rule on POST /api/studio-auth/login is
// the durable control.

export const ATTEMPTS_PER_WINDOW = 5;
export const WINDOW_MS = 60_000;
const MAX_TRACKED = 1000;

export function createAttemptLimiter({ limit = ATTEMPTS_PER_WINDOW, windowMs = WINDOW_MS } = {}) {
  const seen = new Map();
  return function allow(key, now = Date.now()) {
    const id = typeof key === 'string' && key ? key.slice(0, 100) : 'unknown';
    const entry = seen.get(id);
    if (!entry || now - entry.start >= windowMs) {
      if (seen.size >= MAX_TRACKED) {
        for (const [k, v] of seen) if (now - v.start >= windowMs) seen.delete(k);
        if (seen.size >= MAX_TRACKED) seen.delete(seen.keys().next().value);
      }
      seen.set(id, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

export function clientAddress(headers) {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') || 'unknown';
}
