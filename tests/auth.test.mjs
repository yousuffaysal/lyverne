// Regression tests for the authentication boundary.
//
// These exist because the site moved off OpenAI Sites, where identity arrived
// in oai-authenticated-user-* headers that only the platform could set. Off
// that platform those headers are attacker-controlled, so every assertion here
// guards against reintroducing a trusted-header path or loosening verification.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';
import {localDatabase} from '../scripts/local-database.mjs';
import {verifyRequest, isChief, isStaff, readSessionCookie, projectRef} from '../server/auth.mjs';
import {SignJWT, exportJWK, generateKeyPair, createLocalJWKSet} from 'jose';

const origin = 'https://lyverne.test';
const SUPABASE = 'https://test-project.supabase.co';
const OWNER = 'owner@example.test';

async function setup() {
  const DB = await localDatabase(':memory:');
  const real = await generateKeyPair('ES256', {extractable: true});
  const attacker = await generateKeyPair('ES256', {extractable: true});
  const jwk = await exportJWK(real.publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'ES256';
  const env = {DB, ADMIN_EMAIL: OWNER, SUPABASE_URL: SUPABASE, JWKS: createLocalJWKSet({keys: [jwk]})};

  const uuid = name => `00000000-0000-4000-8000-${[...name].reduce((h, c) => h + c.charCodeAt(0).toString(16), '').padEnd(12, '0').slice(0, 12)}`;
  const sign = (name, {key = real.privateKey, iss = `${SUPABASE}/auth/v1`, aud = 'authenticated', exp = '1h', email} = {}) =>
    new SignJWT({email: email ?? (name === 'owner' ? OWNER : `${name}@example.test`), user_metadata: {full_name: name}})
      .setProtectedHeader({alg: 'ES256', kid: 'test-key'})
      .setIssuer(iss).setAudience(aud).setSubject(uuid(name))
      .setIssuedAt().setExpirationTime(exp).sign(key);

  const call = async (path, headers = {}) => {
    const res = await worker.fetch(new Request(origin + path, {headers: {Origin: origin, ...headers}}), env, {});
    return res.status;
  };
  return {DB, env, sign, call, uuid, attackerKey: attacker.privateKey};
}

test('forged trusted headers no longer grant any identity', async () => {
  const app = await setup();
  try {
    const forged = {
      'oai-authenticated-user-id': '00000000-0000-4000-8000-000000000001',
      'oai-authenticated-user-email': OWNER,
      'oai-authenticated-user-full-name': 'Impostor',
    };
    assert.equal(await app.call('/api/admin/overview', forged), 401, 'admin must not open to forged headers');
    assert.equal(await app.call('/api/orders', forged), 401, 'orders must not open to forged headers');
    const res = await worker.fetch(new Request(origin + '/api/me', {headers: {Origin: origin, ...forged}}), app.env, {});
    assert.equal((await res.json()).user, null, 'forged headers must not resolve to a user');
  } finally { app.DB.close(); }
});

test('a token signed by another key is rejected even with a matching kid', async () => {
  const app = await setup();
  try {
    const forged = await app.sign('owner', {key: app.attackerKey});
    assert.equal(await app.call('/api/admin/overview', {Authorization: 'Bearer ' + forged}), 401);
  } finally { app.DB.close(); }
});

test('alg:none tokens are rejected', async () => {
  const app = await setup();
  try {
    const header = Buffer.from(JSON.stringify({alg: 'none', typ: 'JWT'})).toString('base64url');
    const body = Buffer.from(JSON.stringify({sub: app.uuid('owner'), email: OWNER, aud: 'authenticated', iss: `${SUPABASE}/auth/v1`, exp: Math.floor(Date.now() / 1000) + 3600})).toString('base64url');
    assert.equal(await app.call('/api/admin/overview', {Authorization: `Bearer ${header}.${body}.`}), 401);
  } finally { app.DB.close(); }
});

test('expired, wrong-issuer and wrong-audience tokens are rejected', async () => {
  const app = await setup();
  try {
    // Past the 10s clock-skew tolerance documented in server/auth.mjs.
    assert.equal(await app.call('/api/me', {Authorization: 'Bearer ' + await app.sign('owner', {exp: '-1h'})}), 401, 'expired');
    assert.equal(await app.call('/api/me', {Authorization: 'Bearer ' + await app.sign('owner', {exp: '-60s'})}), 401, 'expired a minute ago');
    assert.equal(await app.call('/api/me', {Authorization: 'Bearer ' + await app.sign('owner', {exp: '-2s'})}), 200, 'within the documented skew tolerance');
    assert.equal(await app.call('/api/me', {Authorization: 'Bearer ' + await app.sign('owner', {iss: 'https://evil.test/auth/v1'})}), 401, 'wrong issuer');
    assert.equal(await app.call('/api/me', {Authorization: 'Bearer ' + await app.sign('owner', {aud: 'anon'})}), 401, 'wrong audience');
  } finally { app.DB.close(); }
});

test('a tampered signature is rejected', async () => {
  const app = await setup();
  try {
    const token = await app.sign('owner');
    assert.equal(await app.call('/api/me', {Authorization: 'Bearer ' + token.slice(0, -4) + 'AAAA'}), 401);
  } finally { app.DB.close(); }
});

test('a valid token for a non-owner cannot reach admin endpoints', async () => {
  const app = await setup();
  try {
    const customer = 'Bearer ' + await app.sign('shopper');
    assert.equal(await app.call('/api/admin/overview', {Authorization: customer}), 403);
    assert.equal(await app.call('/api/admin/promotions', {Authorization: customer}), 403);
    assert.equal(await app.call('/api/orders', {Authorization: customer}), 200, 'but their own orders remain readable');
  } finally { app.DB.close(); }
});

test('the chief is admitted, and the role column is mirrored from ADMIN_EMAIL', async () => {
  const app = await setup();
  try {
    assert.equal(await app.call('/api/admin/overview', {Authorization: 'Bearer ' + await app.sign('owner')}), 200);
    const row = await app.env.DB.prepare('SELECT role FROM customers WHERE email=?').bind(OWNER).first();
    assert.equal(row.role, 'chief');
    const shopper = await app.sign('shopper');
    await app.call('/api/me', {Authorization: 'Bearer ' + shopper});
    const other = await app.env.DB.prepare('SELECT role FROM customers WHERE email=?').bind('shopper@example.test').first();
    assert.equal(other.role, 'customer');
  } finally { app.DB.close(); }
});

test('being chief needs both the ADMIN_EMAIL match and the stored role', () => {
  assert.equal(isChief({email: OWNER}, 'chief', OWNER), true);
  assert.equal(isChief({email: OWNER}, 'owner', OWNER), true, 'the pre-team spelling still counts');
  assert.equal(isChief({email: OWNER}, 'customer', OWNER), false, 'email alone is not enough');
  assert.equal(isChief({email: 'other@example.test'}, 'chief', OWNER), false, 'role alone is not enough');
  assert.equal(isChief({email: OWNER}, 'chief', ''), false, 'unset ADMIN_EMAIL grants nobody');
  assert.equal(isChief(null, 'chief', OWNER), false, 'anonymous is never the chief');
  // An appointed admin must never be mistaken for the chief, whatever email
  // they sign in with -- this is the line that keeps user management exclusive.
  assert.equal(isChief({email: OWNER}, 'admin', OWNER), false, 'an admin is not the chief');
});

test('staff covers admins and the chief, never customers', () => {
  assert.equal(isStaff('admin'), true);
  assert.equal(isStaff('chief'), true);
  assert.equal(isStaff('owner'), true);
  assert.equal(isStaff('customer'), false);
  assert.equal(isStaff(''), false);
  assert.equal(isStaff(undefined), false);
});

test('session cookies are parsed safely and malformed ones read as anonymous', async () => {
  const ref = projectRef(SUPABASE);
  assert.equal(ref, 'test-project');
  assert.equal(readSessionCookie(undefined, ref), null);
  assert.equal(readSessionCookie('unrelated=1', ref), null);
  assert.equal(readSessionCookie(`sb-${ref}-auth-token=not-json`, ref), null);
  assert.equal(readSessionCookie(`sb-${ref}-auth-token=base64-${Buffer.from('{"nope":1}').toString('base64')}`, ref), null);
  const good = Buffer.from(JSON.stringify({access_token: 'abc.def.ghi'})).toString('base64');
  assert.equal(readSessionCookie(`sb-${ref}-auth-token=base64-${good}`, ref), 'abc.def.ghi');
});

test('an unconfigured project refuses rather than defaulting to open', async () => {
  const DB = await localDatabase(':memory:');
  try {
    const req = new Request(origin + '/api/me', {headers: {Authorization: 'Bearer whatever'}});
    await assert.rejects(() => verifyRequest(req, {DB}), e => e.status === 503);
  } finally { DB.close(); }
});
