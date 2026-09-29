// Supabase authentication, replacing the OpenAI Sites trusted-header identity.
//
// The old model trusted `oai-authenticated-user-id` because only the Sites
// dispatcher could set it. Off that platform any client can forge a header, so
// identity must now come from a signed token we verify ourselves.
//
// Supabase signs with ES256 and publishes the public key at a JWKS endpoint, so
// verification is local: no per-request call to Supabase, and the signing key
// never leaves Supabase. jose caches the key set and refetches on rotation.

import {createRemoteJWKSet, jwtVerify} from 'jose';
import {Problem, str} from './domain.mjs';

const jwks = new Map(); // one cached key set per project URL

// env.JWKS lets tests supply a local key set instead of fetching Supabase's.
// It can only be a JS function, so it is unreachable from configuration: a
// Worker binding or environment variable is always a string, never callable.
function keysFor(env) {
  if (typeof env.JWKS === 'function') return env.JWKS;
  const supabaseUrl = env.SUPABASE_URL;
  let set = jwks.get(supabaseUrl);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`), {
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000,
    });
    jwks.set(supabaseUrl, set);
  }
  return set;
}

// Supabase stores its session in a cookie named sb-<project-ref>-auth-token,
// splitting it across -.0/-.1 chunks when it exceeds the 4KB cookie limit.
export function readSessionCookie(header, projectRef) {
  if (!header) return null;
  const jar = new Map();
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  const base = `sb-${projectRef}-auth-token`;
  let raw = jar.get(base);
  if (!raw) {
    const chunks = [];
    for (let i = 0; jar.has(`${base}.${i}`); i++) chunks.push(jar.get(`${base}.${i}`));
    if (!chunks.length) return null;
    raw = chunks.join('');
  }
  try {
    if (raw.startsWith('base64-')) raw = atob(raw.slice(7));
    const value = decodeURIComponent(raw);
    const parsed = JSON.parse(value);
    return parsed?.access_token ?? null;
  } catch {
    return null; // a malformed cookie is an anonymous visitor, not an error
  }
}

export function projectRef(supabaseUrl) {
  return new URL(supabaseUrl).hostname.split('.')[0];
}

function bearer(header) {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

// Returns the verified claims, or null for an anonymous visitor. Throws only
// when a token is present but bad, so a forged token is never silently ignored.
export async function verifyRequest(req, env) {
  const supabaseUrl = env.SUPABASE_URL;
  if (!supabaseUrl) throw new Problem('Sign-in is not configured.', 503);
  const token =
    bearer(req.headers.get('authorization')) ||
    readSessionCookie(req.headers.get('cookie'), projectRef(supabaseUrl));
  if (!token) return null;

  let claims;
  try {
    ({payload: claims} = await jwtVerify(token, keysFor(env), {
      issuer: `${supabaseUrl}/auth/v1`,
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256'],
      // Absorbs clock skew between the edge and Supabase so a correctly
      // refreshed session is never rejected for being a second stale. The cost
      // is that a token stays usable for up to 10s past exp, which is far
      // inside Supabase's 1h lifetime and its automatic refresh window.
      clockTolerance: 10,
    }));
  } catch {
    throw new Problem('Your session has expired. Please sign in again.', 401);
  }

  const email = str(claims.email, 320).toLowerCase();
  if (!claims.sub || !email) throw new Problem('Please sign in to continue.', 401);
  // Ownership is decided by comparing this address to ADMIN_EMAIL, so an
  // unverified address must not be trusted: with email confirmations off, an
  // attacker could otherwise register the owner's address and be granted it.
  if (claims.email_verified === false) throw new Problem('Please confirm your email address first.', 403);
  if (claims.is_anonymous === true) throw new Problem('Please sign in to continue.', 401);

  const meta = claims.user_metadata ?? {};
  return {
    id: claims.sub,
    email,
    name: str(meta.full_name || meta.name || email.split('@')[0], 100),
    phone: str(claims.phone || meta.phone, 40),
  };
}

// The chief needs two independent signals: the private ADMIN_EMAIL env var is
// the root of trust, and customers.role mirrors it. A database compromise alone
// therefore cannot mint a chief, and neither can a forged token. Crucially the
// chief cannot be granted from inside the app at all -- only by changing the
// environment variable and redeploying.
export function isChief(claims, storedRole, adminEmail) {
  if (!claims || !adminEmail) return false;
  if (claims.email !== adminEmail.trim().toLowerCase()) return false;
  // 'owner' is the pre-team spelling and still counts, so an existing session
  // is not locked out between the migration and the next sign-in.
  return storedRole === 'chief' || storedRole === 'owner';
}

// Staff reach the admin panel. Admins are appointed by the chief and stored in
// the database, so unlike the chief this role does come from data -- which is
// why admins can never manage people or appoint each other.
export function isStaff(storedRole) {
  return storedRole === 'admin' || storedRole === 'chief' || storedRole === 'owner';
}
