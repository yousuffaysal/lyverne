// The homepage "EXPLORE ALL COLORS" grid, which the chief controls.
//
// Two things these lock in. First, a card is a link to the piece's own page:
// it used to be a button that opened a quick-look dialog, which left the
// product page -- the one carrying the price, the sizes and the structured
// data Google reads -- unreachable from the homepage. Second, the homepage
// falls back to its hand-written cards rather than rendering an empty hole.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';
import {localDatabase} from '../scripts/local-database.mjs';
import {homeGrid, HOME_START, HOME_END} from '../server/render.mjs';
import {productInput} from '../server/domain.mjs';

const ORIGIN = 'https://lyverne.com';
const STATIC_CARDS = '<article><button class="edition-card" data-product-id="signature-onyx">Onyx Black</button></article>';
const PAGE = `<!doctype html><html><head><title>LYVERNE</title></head><body>`
  + `<div class="home-product-grid">${HOME_START}${STATIC_CARDS}${HOME_END}</div></body></html>`;

const piece = (id, slug, color, slot, status = 'active') => ({
  id, slug, color, slot, status,
  name: 'The Signature Tee', description: 'A relaxed tee.', category: 'SIGNATURE',
  price: 1800, stock: 10, sizes: ['S', 'M', 'L'], image: `/assets/tee-${id}.png`, back: '',
});

async function setup(pieces) {
  const DB = await localDatabase(':memory:');
  const at = new Date().toISOString();
  for (const p of pieces) {
    await DB.prepare('INSERT INTO products(id,slug,name,color,description,category,price,stock,sizes,image,back,status,home_slot,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(p.id, p.slug, p.name, p.color, p.description, p.category, p.price, p.stock, JSON.stringify(p.sizes), p.image, p.back, p.status, p.slot, at, at).run();
  }
  const ASSETS = {fetch: async () => new Response(PAGE, {status: 200, headers: {'Content-Type': 'text/html'}})};
  const env = {DB, ASSETS, SITE_ORIGIN: ORIGIN};
  const home = async () => {
    const res = await worker.fetch(new Request(ORIGIN + '/', {headers: {Origin: ORIGIN}}), env, {});
    return {status: res.status, html: await res.text()};
  };
  return {DB, env, home};
}

test('the homepage grid is the featured pieces, in the chief\'s order', async () => {
  const app = await setup([
    piece('c', 'signature-orange', 'Lyverne Orange', 3),
    piece('a', 'signature-onyx', 'Onyx Black', 1),
    piece('b', 'signature-cream', 'Warm Cream', 2),
    piece('d', 'signature-charcoal', 'Washed Charcoal', 0), // not featured
  ]);
  try {
    const {status, html} = await app.home();
    assert.equal(status, 200);
    const colours = [...html.matchAll(/<span class="edition-caption">([^<]*?) </g)].map(m => m[1]);
    assert.deepEqual(colours, ['Onyx Black', 'Warm Cream', 'Lyverne Orange'], 'home_slot decides the order');
    assert.equal(html.includes('Washed Charcoal'), false, 'slot 0 stays off the homepage');
    assert.equal(html.includes('data-product-id'), false, 'the static cards were replaced');
  } finally { app.DB.close(); }
});

test('every card links to that piece\'s own product page', async () => {
  const app = await setup([piece('a', 'signature-onyx', 'Onyx Black', 1)]);
  try {
    const {html} = await app.home();
    assert.match(html, /<a class="edition-card" href="\/collection\/signature-onyx\/"/, 'a link, not a dialog button');
    assert.equal(html.includes('<button class="edition-card"'), false, 'no button left to swallow the click');
  } finally { app.DB.close(); }
});

test('with nothing featured the hand-written cards stay', async () => {
  // An empty hole where the collection should be is worse than last week's
  // three colours, so the static markup is the fallback.
  const app = await setup([piece('a', 'signature-onyx', 'Onyx Black', 0)]);
  try {
    const {status, html} = await app.home();
    assert.equal(status, 200);
    assert.equal(html.includes('Onyx Black'), true);
    assert.match(html, /<button class="edition-card"/, 'fell back to the static cards');
  } finally { app.DB.close(); }
});

test('a draft can never reach the homepage', async () => {
  // A featured draft would render a card linking to a page that refuses to
  // load, so the rule is enforced on the way in and on the way out.
  const app = await setup([piece('a', 'signature-onyx', 'Onyx Black', 1, 'draft')]);
  try {
    const {html} = await app.home();
    assert.match(html, /<button class="edition-card"/, 'a drafted piece does not render');
  } finally { app.DB.close(); }

  const base = {name: 'Tee', color: 'Onyx', description: 'A tee.', sizes: ['M'], image: '/assets/tee-front.png', price: 1800, stock: 4};
  assert.throws(() => productInput({...base, status: 'draft', home_slot: 2}), /Publish the piece/);
  assert.equal(productInput({...base, status: 'active', home_slot: 2}).home_slot, 2);
  assert.equal(productInput({...base, status: 'draft', home_slot: 0}).home_slot, 0, 'an unfeatured draft is fine');
});

test('the homepage position is validated', () => {
  const base = {name: 'Tee', color: 'Onyx', description: 'A tee.', sizes: ['M'], image: '/assets/tee-front.png', price: 1800, stock: 4, status: 'active'};
  assert.equal(productInput({...base}).home_slot, 0, 'absent means not featured');
  assert.equal(productInput({...base, home_slot: ''}).home_slot, 0);
  assert.throws(() => productInput({...base, home_slot: 13}), /0 to 12/);
  assert.throws(() => productInput({...base, home_slot: -1}), /0 to 12/);
  assert.throws(() => productInput({...base, home_slot: 1.5}), /0 to 12/);
  assert.throws(() => productInput({...base, home_slot: 'first'}), /0 to 12/);
});

test('homeGrid escapes what it renders', () => {
  const html = homeGrid([{slug: 'x', name: 'Tee "<script>"', color: 'A & B', image: '/assets/tee-front.png'}]);
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /A &amp; B/);
});
