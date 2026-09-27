// Browser-side Supabase authentication.
//
// Talks to the GoTrue REST API directly rather than loading the Supabase SDK:
// the SDK is ~120KB for the handful of calls used here, and this site ships no
// framework. On a Dhaka mobile connection that saving is worth more than the
// convenience.
//
// The session lives in localStorage and every authenticated request carries an
// Authorization header. The Worker verifies that token's signature against
// Supabase's public key, so nothing here is trusted -- losing this file to an
// attacker grants nothing the browser did not already have.

const STORAGE_KEY = 'lyverne-session';
// Refresh this far ahead of expiry so a request never leaves with a token that
// expires mid-flight.
const REFRESH_MARGIN_MS = 60_000;

let config = null;
let session = null;
let refreshing = null;

const readStored = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
};
const store = value => {
  session = value;
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* private mode: the session lasts this page only */ }
};

// Normalises a GoTrue token response into what we persist.
const asSession = data => data?.access_token ? {
  access_token: data.access_token,
  refresh_token: data.refresh_token,
  expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  user: data.user || null,
} : null;

async function loadConfig() {
  if (config) return config;
  const res = await fetch('/api/config');
  config = await res.json();
  if (!config.supabaseUrl || !config.supabaseKey) throw new Error('Sign-in is not configured for this store yet.');
  return config;
}

async function gotrue(path, {method = 'POST', body, token} = {}) {
  const {supabaseUrl, supabaseKey} = await loadConfig();
  const res = await fetch(`${supabaseUrl}/auth/v1${path}`, {
    method,
    headers: {
      apikey: supabaseKey,
      'Content-Type': 'application/json',
      ...(token ? {Authorization: 'Bearer ' + token} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // GoTrue spreads its message across several fields depending on the error.
    throw new Error(data.error_description || data.msg || data.message || 'Sign-in failed. Please try again.');
  }
  return data;
}

// A magic link or OAuth redirect returns tokens in the URL fragment. Consume
// them, then strip the fragment so the tokens never sit in history or leak
// through a Referer header.
export function consumeRedirect() {
  if (!location.hash.includes('access_token=') && !location.hash.includes('error=')) return null;
  const params = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  const error = params.get('error_description') || params.get('error');
  if (error) return {error};
  const next = asSession({
    access_token: params.get('access_token'),
    refresh_token: params.get('refresh_token'),
    expires_in: params.get('expires_in'),
  });
  if (next) store(next);
  return next ? {session: next} : null;
}

async function refresh() {
  const current = session || readStored();
  if (!current?.refresh_token) return null;
  // Collapse concurrent callers onto one refresh; two in flight would race and
  // one would be rejected with an already-used refresh token.
  if (!refreshing) {
    refreshing = gotrue('/token?grant_type=refresh_token', {body: {refresh_token: current.refresh_token}})
      .then(data => { const next = asSession(data); store(next); return next; })
      .catch(() => { store(null); return null; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

// The access token for the current session, refreshed if it is close to expiry.
// Returns null for a signed-out visitor.
export async function getToken() {
  if (!session) session = readStored();
  if (!session) return null;
  if (session.expires_at - Date.now() < REFRESH_MARGIN_MS) {
    const next = await refresh();
    return next?.access_token ?? null;
  }
  return session.access_token;
}

export const isSignedIn = () => !!(session || readStored());

export async function signUp({email, password, name}) {
  const data = await gotrue('/signup', {
    body: {email, password, data: {full_name: name || ''}, options: {data: {full_name: name || ''}}},
  });
  const next = asSession(data);
  if (next) store(next);
  // With email confirmation enabled GoTrue returns a user but no session.
  return {session: next, confirmationRequired: !next};
}

export async function signIn({email, password}) {
  const next = asSession(await gotrue('/token?grant_type=password', {body: {email, password}}));
  store(next);
  return next;
}

export async function sendMagicLink({email, redirectTo}) {
  const {supabaseUrl} = await loadConfig();
  await gotrue(`/otp?redirect_to=${encodeURIComponent(redirectTo || location.origin + '/dashboard/')}`, {
    body: {email, create_user: true},
  });
  return {sent: true, supabaseUrl};
}

export async function signInWithGoogle(redirectTo) {
  const {supabaseUrl, supabaseKey} = await loadConfig();
  const target = encodeURIComponent(redirectTo || location.origin + '/dashboard/');
  location.assign(`${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${target}&apikey=${encodeURIComponent(supabaseKey)}`);
}

export async function sendPasswordReset({email, redirectTo}) {
  await gotrue(`/recover?redirect_to=${encodeURIComponent(redirectTo || location.origin + '/login/')}`, {body: {email}});
  return {sent: true};
}

export async function signOut() {
  const token = await getToken();
  // Revoke server-side where possible, but always clear locally: a failed
  // network call must not leave someone looking signed in.
  if (token) { try { await gotrue('/logout', {token}); } catch { /* ignore */ } }
  store(null);
}
