// Regression tests for the team boundary: chief, appointed admins, assigned
// work and the staff chat.
//
// The line these guard is narrow and load-bearing: an admin runs the store but
// must not be able to appoint or block anyone. If that slipped, one phished
// admin account would be equivalent to the chief's, and the blocking control
// the chief relies on could be turned on the chief.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';
import {localDatabase} from '../scripts/local-database.mjs';
import {SignJWT, exportJWK, generateKeyPair, createLocalJWKSet} from 'jose';

const origin = 'https://lyverne.test';
const SUPABASE = 'https://test-project.supabase.co';
const CHIEF = 'chief@example.test';

async function setup() {
  const DB = await localDatabase(':memory:');
  const keys = await generateKeyPair('ES256', {extractable: true});
  const jwk = await exportJWK(keys.publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'ES256';
  const env = {DB, ADMIN_EMAIL: CHIEF, SUPABASE_URL: SUPABASE, JWKS: createLocalJWKSet({keys: [jwk]})};

  const uuid = name => `00000000-0000-4000-8000-${[...name].reduce((h, c) => h + c.charCodeAt(0).toString(16), '').padEnd(12, '0').slice(0, 12)}`;
  const token = name => new SignJWT({email: name === 'chief' ? CHIEF : `${name}@example.test`, user_metadata: {full_name: name}})
    .setProtectedHeader({alg: 'ES256', kid: 'test-key'})
    .setIssuer(`${SUPABASE}/auth/v1`).setAudience('authenticated').setSubject(uuid(name))
    .setIssuedAt().setExpirationTime('1h').sign(keys.privateKey);

  const as = async (name, path, {method = 'GET', body} = {}) => {
    const res = await worker.fetch(new Request(origin + path, {
      method,
      headers: {
        Origin: origin,
        Authorization: 'Bearer ' + await token(name),
        ...(body ? {'Content-Type': 'application/json'} : {}),
      },
      ...(body ? {body: JSON.stringify(body)} : {}),
    }), env, {});
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* not every response is JSON */ }
    return {status: res.status, data};
  };

  // Signing in creates the row; the chief is derived from ADMIN_EMAIL, so this
  // is all it takes for them to exist as staff.
  await as('chief', '/api/me');
  await as('nadia', '/api/me');
  await as('shopper', '/api/me');
  const appoint = async name => {
    await as(name, '/api/me'); // they must have signed in once to have a row
    const res = await as('chief', '/api/admin/users/' + uuid(name), {method: 'PUT', body: {role: 'admin'}});
    assert.equal(res.status, 200, 'the chief should be able to appoint ' + name);
  };
  return {DB, env, as, uuid, appoint};
}

test('any staff member sees the team; a customer sees nothing', async () => {
  const app = await setup();
  try {
    await app.appoint('nadia');
    const chief = await app.as('chief', '/api/admin/users');
    assert.equal(chief.status, 200);
    assert.equal(chief.data.you.chief, true);
    const roles = Object.fromEntries(chief.data.users.map(u => [u.email, u.role]));
    assert.equal(roles[CHIEF], 'chief');
    assert.equal(roles['nadia@example.test'], 'admin');
    assert.equal(roles['shopper@example.test'], 'customer');

    const admin = await app.as('nadia', '/api/admin/users');
    assert.equal(admin.status, 200, 'an admin may see who the team is');
    assert.equal(admin.data.you.chief, false, 'but is never reported as chief');

    assert.equal((await app.as('shopper', '/api/admin/users')).status, 403);
  } finally { app.DB.close(); }
});

test('only the chief can appoint, demote or block', async () => {
  const app = await setup();
  try {
    await app.appoint('nadia');
    // The whole point of the two-tier split: an admin cannot make more admins.
    const promote = await app.as('nadia', '/api/admin/users/' + app.uuid('shopper'), {method: 'PUT', body: {role: 'admin'}});
    assert.equal(promote.status, 403, 'an admin must not appoint anyone');
    const blocked = await app.as('nadia', '/api/admin/users/' + app.uuid('chief'), {method: 'PUT', body: {role: 'admin', blocked: true}});
    assert.equal(blocked.status, 403, 'an admin must not be able to block the chief');
    const still = await app.env.DB.prepare('SELECT role,blocked FROM customers WHERE email=?').bind('shopper@example.test').first();
    assert.equal(still.role, 'customer');
    assert.equal(Number(still.blocked), 0);
  } finally { app.DB.close(); }
});

test('the chief account cannot be edited or locked out from inside the app', async () => {
  const app = await setup();
  try {
    // Their own row is refused as self-editing, and the ADMIN_EMAIL row is
    // refused outright -- so no form here can lock the store out of itself.
    const self = await app.as('chief', '/api/admin/users/' + app.uuid('chief'), {method: 'PUT', body: {role: 'customer'}});
    assert.equal(self.status, 400);
    const role = await app.env.DB.prepare('SELECT role FROM customers WHERE email=?').bind(CHIEF).first();
    assert.equal(role.role, 'chief');
  } finally { app.DB.close(); }
});

test('an appointed admin keeps their role across sign-ins', async () => {
  const app = await setup();
  try {
    await app.appoint('nadia');
    // identity() re-derives the role on every request. Deriving it from
    // ADMIN_EMAIL alone would demote every admin the chief ever added.
    assert.equal((await app.as('nadia', '/api/me')).status, 200);
    assert.equal((await app.as('nadia', '/api/admin/overview')).status, 200);
    const row = await app.env.DB.prepare('SELECT role FROM customers WHERE email=?').bind('nadia@example.test').first();
    assert.equal(row.role, 'admin');
  } finally { app.DB.close(); }
});

test('a blocked account is refused everywhere, and unblocking restores it', async () => {
  const app = await setup();
  try {
    await app.appoint('nadia');
    await app.as('chief', '/api/admin/users/' + app.uuid('nadia'), {method: 'PUT', body: {role: 'admin', blocked: true}});
    assert.equal((await app.as('nadia', '/api/admin/overview')).status, 403);
    assert.equal((await app.as('nadia', '/api/orders')).status, 403, 'blocked means blocked, not signed out');
    // Blocking is separate from the appointment, so lifting it does not mean
    // granting admin again by hand.
    await app.as('chief', '/api/admin/users/' + app.uuid('nadia'), {method: 'PUT', body: {role: 'admin', blocked: false}});
    assert.equal((await app.as('nadia', '/api/admin/overview')).status, 200);
  } finally { app.DB.close(); }
});

test('the chief assigns work; an admin sees only their own and can move it along', async () => {
  const app = await setup();
  try {
    await app.appoint('nadia');
    await app.appoint('rifat');
    assert.equal((await app.as('chief', '/api/admin/tasks', {method: 'POST', body: {title: 'Shoot the cream tee', assignee_id: app.uuid('nadia'), detail: 'Daylight, no flash.'}})).status, 201);
    assert.equal((await app.as('chief', '/api/admin/tasks', {method: 'POST', body: {title: 'Reply to Friday orders', assignee_id: app.uuid('rifat')}})).status, 201);

    const board = await app.as('chief', '/api/admin/tasks');
    assert.equal(board.data.tasks.length, 2, 'the chief sees the whole board');
    assert.equal(board.data.tasks[0].assignee_email !== undefined, true);

    const mine = await app.as('nadia', '/api/admin/tasks');
    assert.equal(mine.data.tasks.length, 1, 'an admin sees only their own work');
    assert.equal(mine.data.tasks[0].title, 'Shoot the cream tee');

    // An admin may progress their own task, but not touch someone else's.
    const task = mine.data.tasks[0].id;
    assert.equal((await app.as('nadia', '/api/admin/tasks/' + task, {method: 'PUT', body: {status: 'doing'}})).status, 200);
    const other = board.data.tasks.find(t => t.assignee_id === app.uuid('rifat')).id;
    assert.equal((await app.as('nadia', '/api/admin/tasks/' + other, {method: 'PUT', body: {status: 'done'}})).status, 403);
    assert.equal((await app.as('nadia', '/api/admin/tasks/' + task, {method: 'DELETE'})).status, 403, 'only the chief removes a task');
  } finally { app.DB.close(); }
});

test('an admin cannot assign work, to themselves or anyone else', async () => {
  const app = await setup();
  try {
    await app.appoint('nadia');
    const res = await app.as('nadia', '/api/admin/tasks', {method: 'POST', body: {title: 'Self-assigned', assignee_id: app.uuid('nadia')}});
    assert.equal(res.status, 403);
    assert.equal((await app.as('chief', '/api/admin/tasks')).data.tasks.length, 0);
  } finally { app.DB.close(); }
});

test('a task must be assigned to staff, and rubbish input is refused', async () => {
  const app = await setup();
  try {
    // Assigning to a customer would put an admin task in a shopper's dashboard.
    assert.equal((await app.as('chief', '/api/admin/tasks', {method: 'POST', body: {title: 'Leak', assignee_id: app.uuid('shopper')}})).status, 400);
    assert.equal((await app.as('chief', '/api/admin/tasks', {method: 'POST', body: {title: ''}})).status, 400);
    assert.equal((await app.as('chief', '/api/admin/tasks', {method: 'POST', body: {title: 'Bad date', due_date: 'next tuesday'}})).status, 400);
    assert.equal((await app.as('chief', '/api/admin/users/' + app.uuid('shopper'), {method: 'PUT', body: {role: 'chief'}})).status, 400, 'chief is not grantable');
  } finally { app.DB.close(); }
});

test('the staff chat is staff-only and reads back in order', async () => {
  const app = await setup();
  try {
    await app.appoint('nadia');
    assert.equal((await app.as('chief', '/api/admin/messages', {method: 'POST', body: {body: 'Morning. Stock count today.'}})).status, 201);
    assert.equal((await app.as('nadia', '/api/admin/messages', {method: 'POST', body: {body: 'On it.'}})).status, 201);
    assert.equal((await app.as('shopper', '/api/admin/messages', {method: 'POST', body: {body: 'hello?'}})).status, 403);
    assert.equal((await app.as('shopper', '/api/admin/messages')).status, 403);

    const thread = await app.as('nadia', '/api/admin/messages');
    assert.equal(thread.status, 200);
    assert.equal(thread.data.messages.length, 2);
    // Both posts can land in the same millisecond, so what matters is that the
    // order is stable across reads rather than which of the two comes first.
    const again = await app.as('nadia', '/api/admin/messages');
    assert.deepEqual(again.data.messages.map(m => m.id), thread.data.messages.map(m => m.id), 'stable order');
    assert.deepEqual([...thread.data.messages.map(m => m.body)].sort(), ['Morning. Stock count today.', 'On it.']);
    assert.equal((await app.as('chief', '/api/admin/messages', {method: 'POST', body: {body: '   '}})).status, 400);
  } finally { app.DB.close(); }
});

test('the chat reads oldest-first once timestamps differ', async () => {
  const app = await setup();
  try {
    const chief = app.uuid('chief');
    for (const [id, at, body] of [
      ['msg-c', '2026-03-02T09:00:00.000Z', 'third'],
      ['msg-a', '2026-03-01T09:00:00.000Z', 'first'],
      ['msg-b', '2026-03-01T17:30:00.000Z', 'second'],
    ]) await app.env.DB.prepare('INSERT INTO admin_messages(id,author_id,body,created_at) VALUES(?,?,?,?)').bind(id, chief, body, at).run();
    const thread = await app.as('chief', '/api/admin/messages');
    assert.deepEqual(thread.data.messages.map(m => m.body), ['first', 'second', 'third']);
  } finally { app.DB.close(); }
});
