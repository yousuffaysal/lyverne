// Bulk and custom orders: the enquiry form for teams and organisations.
//
// The submission endpoint is open to anyone -- a university society has no
// reason to hold a shop account before asking for a quote -- so these lock in
// that it validates everything itself and gives nothing back, and that reading
// the enquiries is staff-only. Each row carries a named person, their mobile
// and their email.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';
import {localDatabase} from '../scripts/local-database.mjs';
import {customOrderInput, decodeCustomOrder, MIN_QUANTITY, MAX_QUANTITY} from '../server/custom-orders.mjs';
import {SignJWT, exportJWK, generateKeyPair, createLocalJWKSet} from 'jose';

const origin = 'https://lyverne.test';
const SUPABASE = 'https://test-project.supabase.co';
const CHIEF = 'chief@example.test';

const enquiry = (over = {}) => ({
  org_type: 'university', org_name: 'Dhaka University Football Club',
  contact_name: 'Nadia Rahman', contact_role: 'Captain',
  email: 'nadia@du.example', phone: '01712345678',
  division: 'Dhaka', district: 'Dhaka',
  product: 'jersey', quantity: 40, sizes: {M: 15, L: 15, XL: 10},
  colours: 'Navy and white', design_route: 'own',
  design_link: 'https://drive.example/our-crest.png',
  brief: 'Crest on the chest, numbers on the back.',
  deadline: '2026-12-01', note: 'We need them before the tournament.',
  ...over,
});

async function setup() {
  const DB = await localDatabase(':memory:');
  const keys = await generateKeyPair('ES256', {extractable: true});
  const jwk = await exportJWK(keys.publicKey); jwk.kid = 'test-key'; jwk.alg = 'ES256';
  const env = {DB, ADMIN_EMAIL: CHIEF, SUPABASE_URL: SUPABASE, JWKS: createLocalJWKSet({keys: [jwk]})};
  const uuid = name => `00000000-0000-4000-8000-${[...name].reduce((h, c) => h + c.charCodeAt(0).toString(16), '').padEnd(12, '0').slice(0, 12)}`;
  const token = name => new SignJWT({email: name === 'chief' ? CHIEF : `${name}@example.test`, user_metadata: {full_name: name}})
    .setProtectedHeader({alg: 'ES256', kid: 'test-key'})
    .setIssuer(`${SUPABASE}/auth/v1`).setAudience('authenticated').setSubject(uuid(name))
    .setIssuedAt().setExpirationTime('1h').sign(keys.privateKey);

  const call = async (path, {method = 'GET', body, as} = {}) => {
    const headers = {Origin: origin, ...(body ? {'Content-Type': 'application/json'} : {})};
    if (as) headers.Authorization = 'Bearer ' + await token(as);
    const res = await worker.fetch(new Request(origin + path, {method, headers, ...(body ? {body: JSON.stringify(body)} : {})}), env, {});
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch { /* not all responses are JSON */ }
    return {status: res.status, data};
  };
  return {DB, env, call, uuid};
}

test('anyone may send an enquiry, and only the reference comes back', async () => {
  const app = await setup();
  try {
    const res = await app.call('/api/custom-orders', {method: 'POST', body: enquiry()});
    assert.equal(res.status, 201);
    assert.match(res.data.reference, /^LYC-[0-9A-F]{6}$/);
    // Echoing the stored row would hand a stranger whatever the table filled in.
    assert.deepEqual(Object.keys(res.data), ['reference']);
    const row = await app.env.DB.prepare('SELECT * FROM custom_orders WHERE reference=?').bind(res.data.reference).first();
    assert.equal(row.org_name, 'Dhaka University Football Club');
    assert.equal(row.status, 'new');
    assert.equal(row.admin_note, '', 'the internal notepad starts empty');
    assert.deepEqual(decodeCustomOrder(row).sizes, {M: 15, L: 15, XL: 10});
  } finally { app.DB.close(); }
});

test('the enquiry board is staff-only', async () => {
  const app = await setup();
  try {
    await app.call('/api/custom-orders', {method: 'POST', body: enquiry()});
    assert.equal((await app.call('/api/admin/custom-orders')).status, 401, 'a stranger sees nothing');
    assert.equal((await app.call('/api/admin/custom-orders', {as: 'shopper'})).status, 403, 'nor does a customer');
    const staff = await app.call('/api/admin/custom-orders', {as: 'chief'});
    assert.equal(staff.status, 200);
    assert.equal(staff.data.enquiries.length, 1);
    assert.equal(staff.data.enquiries[0].phone, '01712345678');
  } finally { app.DB.close(); }
});

test('the options the form offers are the options the server accepts', async () => {
  const app = await setup();
  try {
    const res = await app.call('/api/custom-orders/options');
    assert.equal(res.status, 200);
    assert.ok(res.data.products.jersey && res.data.orgTypes.university && res.data.designRoutes.own);
    assert.equal(res.data.minQuantity, MIN_QUANTITY);
    assert.equal(Object.keys(res.data.divisions).length, 8);
    // Anything outside the published lists falls back rather than being stored.
    const out = customOrderInput(enquiry({org_type: 'martian', design_route: 'telepathy', design_link: 'https://a.test/x'}));
    assert.equal(out.org_type, 'other');
    assert.equal(out.design_route, 'idea');
  } finally { app.DB.close(); }
});

test('an enquiry has to be answerable and deliverable', () => {
  assert.throws(() => customOrderInput(enquiry({org_name: ''})), /which organisation/);
  assert.throws(() => customOrderInput(enquiry({contact_name: ''})), /who we should speak to/);
  assert.throws(() => customOrderInput(enquiry({email: 'not-an-email'})), /email address/);
  assert.throws(() => customOrderInput(enquiry({phone: '12345'})), /Bangladeshi mobile/);
  assert.throws(() => customOrderInput(enquiry({product: ''})), /what you would like made/);
  assert.throws(() => customOrderInput(enquiry({quantity: MIN_QUANTITY - 1})), /run from/);
  assert.throws(() => customOrderInput(enquiry({quantity: MAX_QUANTITY + 1})), /run from/);
  assert.throws(() => customOrderInput(enquiry({quantity: 12.5})), /run from/);
  assert.throws(() => customOrderInput(enquiry({deadline: 'next month'})), /valid date/);
  // Given at all, the region pair still has to be real.
  assert.throws(() => customOrderInput(enquiry({division: 'Dhaka', district: "Cox's Bazar"})), /division and district/);
  // But an enquiry is not a delivery, so having none is fine.
  assert.equal(customOrderInput(enquiry({division: '', district: ''})).division, '');
});

test('a design link must be somewhere a design can actually be fetched from', () => {
  assert.throws(() => customOrderInput(enquiry({design_link: 'javascript:alert(1)'})), /https/);
  assert.throws(() => customOrderInput(enquiry({design_link: 'data:text/html,<script>'})), /https/);
  assert.throws(() => customOrderInput(enquiry({design_link: 'not a url'})), /web address/);
  // Saying you have artwork but attaching none leaves the studio with nothing.
  assert.throws(() => customOrderInput(enquiry({design_route: 'own', design_link: ''})), /Share a link/);
  // The other two routes do not need one.
  assert.equal(customOrderInput(enquiry({design_route: 'lyverne', design_link: ''})).design_link, '');
  assert.equal(customOrderInput(enquiry({design_route: 'idea', design_link: ''})).design_route, 'idea');
});

test('the size breakdown has to agree with the quantity, and cannot smuggle keys', () => {
  assert.deepEqual(JSON.parse(customOrderInput(enquiry({quantity: 40, sizes: {M: 20, L: 20}})).sizes), {M: 20, L: 20});
  assert.throws(() => customOrderInput(enquiry({quantity: 40, sizes: {M: 5}})), /add up to 5/);
  assert.throws(() => customOrderInput(enquiry({sizes: {M: 1.5, L: 38.5}})), /whole numbers/);
  // Unknown keys are dropped rather than stored, so the object cannot be used
  // to push arbitrary content into the row.
  assert.deepEqual(JSON.parse(customOrderInput(enquiry({sizes: {__proto__: 'x', evil: 9, M: 40}})).sizes), {M: 40});
  // Leaving the breakdown out entirely is allowed: plenty of teams do not know
  // it yet, and the total quantity is what the quote is built from.
  assert.deepEqual(JSON.parse(customOrderInput(enquiry({sizes: undefined})).sizes), {});
});

test('staff move an enquiry along; the customer note is never overwritten', async () => {
  const app = await setup();
  try {
    const {data: {reference}} = await app.call('/api/custom-orders', {method: 'POST', body: enquiry()});
    const before = await app.env.DB.prepare('SELECT id,version,note FROM custom_orders WHERE reference=?').bind(reference).first();

    const bad = await app.call('/api/admin/custom-orders/' + before.id, {method: 'PUT', as: 'chief', body: {status: 'invented', version: before.version}});
    assert.equal(bad.status, 400);

    const ok = await app.call('/api/admin/custom-orders/' + before.id, {method: 'PUT', as: 'chief',
      body: {status: 'quoted', admin_note: 'Quoted 1650/piece at 40 units.', version: before.version, reference}});
    assert.equal(ok.status, 200);
    const after = await app.env.DB.prepare('SELECT * FROM custom_orders WHERE id=?').bind(before.id).first();
    assert.equal(after.status, 'quoted');
    assert.equal(after.admin_note, 'Quoted 1650/piece at 40 units.');
    assert.equal(after.note, before.note, 'what the customer wrote is left alone');

    // A second save on the version we already used must lose, not silently win.
    const stale = await app.call('/api/admin/custom-orders/' + before.id, {method: 'PUT', as: 'chief',
      body: {status: 'closed', admin_note: 'clobber', version: before.version}});
    assert.equal(stale.status, 409);
    assert.equal((await app.env.DB.prepare('SELECT status FROM custom_orders WHERE id=?').bind(before.id).first()).status, 'quoted');

    assert.equal((await app.call('/api/admin/custom-orders/' + before.id, {method: 'PUT', as: 'shopper', body: {status: 'closed', version: 2}})).status, 403);
  } finally { app.DB.close(); }
});

test('the board can be filtered by status', async () => {
  const app = await setup();
  try {
    await app.call('/api/custom-orders', {method: 'POST', body: enquiry()});
    await app.call('/api/custom-orders', {method: 'POST', body: enquiry({org_name: 'BUET Cricket'})});
    const all = await app.call('/api/admin/custom-orders', {as: 'chief'});
    const first = all.data.enquiries[0];
    await app.call('/api/admin/custom-orders/' + first.id, {method: 'PUT', as: 'chief', body: {status: 'closed', version: first.version}});
    const open = await app.call('/api/admin/custom-orders?status=new', {as: 'chief'});
    assert.equal(open.data.enquiries.length, 1);
    assert.equal(open.data.enquiries[0].status, 'new');
    // An unknown filter shows everything rather than silently hiding the board.
    assert.equal((await app.call('/api/admin/custom-orders?status=nonsense', {as: 'chief'})).data.enquiries.length, 2);
  } finally { app.DB.close(); }
});
