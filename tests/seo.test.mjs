// SEO surface: structured data, canonicals, robots and sitemap.
//
// These lock in the things that decide whether a product can rank at all: one
// indexable URL per product, a correct BDT Offer, and no draft or account page
// reachable by a crawler.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';
import {localDatabase} from '../scripts/local-database.mjs';
import {
  siteOrigin, robots, sitemap, productSchema, productMeta,
  breadcrumbs, esc, jsonLd, FALLBACK_ORIGIN,
} from '../server/seo.mjs';

const ORIGIN = 'https://lyverne.com.bd';
const product = {
  id: 'product-1', slug: 'the-signature-tee-onyx-black', name: 'The Signature Tee',
  color: 'Onyx Black', description: 'A relaxed black tee.', category: 'SIGNATURE',
  price: 1800, stock: 12, sizes: ['S', 'M', 'L'], image: '/assets/tee-front.png',
  back: '/assets/tee-back.png', status: 'active', seo_title: '', seo_description: '',
  updated_at: '2026-09-26T10:00:00.000Z',
};

async function setup() {
  const DB = await localDatabase(':memory:');
  const env = {DB, SITE_ORIGIN: ORIGIN};
  const now = new Date().toISOString();
  const insert = (p, status) => DB.prepare('INSERT INTO products(id,slug,name,color,description,category,price,stock,sizes,image,back,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(p.id, p.slug, p.name, p.color, p.description, p.category, p.price, p.stock, JSON.stringify(p.sizes), p.image, p.back, status, now, now).run();
  await insert(product, 'active');
  await insert({...product, id: 'product-2', slug: 'unreleased-drop', name: 'SECRET NEXT DROP'}, 'draft');
  const get = async path => {
    const res = await worker.fetch(new Request(ORIGIN + path), env, {});
    return {status: res.status, headers: res.headers, body: await res.text()};
  };
  return {DB, env, get};
}

test('siteOrigin normalises configuration and falls back safely', () => {
  assert.equal(siteOrigin({SITE_ORIGIN: 'https://lyverne.com.bd'}), 'https://lyverne.com.bd');
  assert.equal(siteOrigin({SITE_ORIGIN: 'https://lyverne.com.bd/'}), 'https://lyverne.com.bd');
  assert.equal(siteOrigin({SITE_ORIGIN: 'lyverne.com.bd'}), 'https://lyverne.com.bd', 'bare host gets https');
  assert.equal(siteOrigin({}), FALLBACK_ORIGIN);
});

test('product structured data carries a BDT offer and real availability', () => {
  const schema = productSchema(ORIGIN, product);
  assert.equal(schema['@type'], 'Product');
  assert.equal(schema.offers.priceCurrency, 'BDT');
  assert.equal(schema.offers.price, '1800');
  assert.equal(schema.offers.availability, 'https://schema.org/InStock');
  assert.equal(schema.url, `${ORIGIN}/collection/${product.slug}/`);
  assert.equal(schema.image.length, 2, 'front and back are both indexable');
  assert.ok(schema.image.every(i => i.startsWith('https://')), 'image URLs must be absolute');
  const out = productSchema(ORIGIN, {...product, stock: 0});
  assert.equal(out.offers.availability, 'https://schema.org/OutOfStock');
});

test('a product without a price advertises no price rather than zero', () => {
  const schema = productSchema(ORIGIN, {...product, price: null});
  assert.equal(schema.offers, undefined);
});

test('owner-set SEO overrides win and lengths stay within search limits', () => {
  const plain = productMeta(product);
  assert.match(plain.title, /Signature Tee/);
  assert.ok(plain.title.length <= 70);
  assert.ok(plain.description.length <= 160);
  const custom = productMeta({...product, seo_title: 'Custom title', seo_description: 'Custom description'});
  assert.equal(custom.title, 'Custom title');
  assert.equal(custom.description, 'Custom description');
});

test('robots blocks account areas and points at the sitemap', () => {
  const txt = robots(ORIGIN);
  for (const path of ['/admin/', '/dashboard/', '/login/', '/signup/', '/api/']) {
    assert.match(txt, new RegExp(`Disallow: ${path.replace(/\//g, '\\/')}`), `${path} must be disallowed`);
  }
  assert.match(txt, /Sitemap: https:\/\/lyverne\.com\.bd\/sitemap\.xml/);
});

test('sitemap lists every product with absolute URLs and valid XML', () => {
  const xml = sitemap(ORIGIN, [product]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, new RegExp(`<loc>${ORIGIN}/collection/${product.slug}/</loc>`));
  assert.match(xml, /<lastmod>2026-09-26<\/lastmod>/);
  assert.match(xml, new RegExp(`<loc>${ORIGIN}/custom/</loc>`), 'team orders is a landing page in its own right');
  assert.equal((xml.match(/<loc>/g) || []).length, 5, 'home, collection, studio, team orders and the product');
  assert.ok(!xml.includes('undefined'));
});

test('escaping closes HTML and JSON-LD injection', () => {
  assert.equal(esc('<script>"x"&\'y\''), '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;');
  const block = jsonLd({name: '</script><img onerror=alert(1)>'});
  assert.ok(!block.includes('</script><img'), 'must not allow an early </script>');
  assert.ok(block.includes('\\u003c'));
});

test('breadcrumbs are ordered and absolute', () => {
  const crumbs = breadcrumbs(ORIGIN, [{name: 'Home', path: '/'}, {name: 'Collection', path: '/collection/'}]);
  assert.equal(crumbs.itemListElement[0].position, 1);
  assert.equal(crumbs.itemListElement[1].item, `${ORIGIN}/collection/`);
});

test('a product page is fully rendered HTML with its structured data', async () => {
  const app = await setup();
  try {
    const res = await app.get(`/collection/${product.slug}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    // The name, price and description must be in the HTML itself, because a
    // crawler that does not run JavaScript has to see them.
    assert.match(res.body, /The Signature Tee/);
    assert.match(res.body, /1,800/);
    assert.match(res.body, /A relaxed black tee\./);
    assert.match(res.body, new RegExp(`<link rel="canonical" href="${ORIGIN}/collection/${product.slug}/">`));
    assert.match(res.body, /<meta property="og:image"/);
    assert.match(res.body, /"@type":"Product"/);
    assert.match(res.body, /"priceCurrency":"BDT"/);
    assert.match(res.body, /"@type":"BreadcrumbList"/);
  } finally { app.DB.close(); }
});

test('draft products are not reachable and not indexed', async () => {
  const app = await setup();
  try {
    const res = await app.get('/collection/unreleased-drop/');
    assert.equal(res.status, 404, 'a draft must never resolve');
    assert.match(res.body, /noindex/);
    assert.ok(!res.body.includes('SECRET NEXT DROP'), 'the draft name must not leak in the 404');
    const map = await app.get('/sitemap.xml');
    assert.ok(!map.body.includes('unreleased-drop'), 'drafts must stay out of the sitemap');
  } finally { app.DB.close(); }
});

test('the unslashed product URL redirects permanently to the canonical form', async () => {
  const app = await setup();
  try {
    const res = await worker.fetch(new Request(`${ORIGIN}/collection/${product.slug}`), app.env, {});
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), `${ORIGIN}/collection/${product.slug}/`);
  } finally { app.DB.close(); }
});

test('robots.txt and sitemap.xml are served with the right content types', async () => {
  const app = await setup();
  try {
    const r = await app.get('/robots.txt');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/plain/);
    const s = await app.get('/sitemap.xml');
    assert.equal(s.status, 200);
    assert.match(s.headers.get('content-type'), /application\/xml/);
    assert.match(s.body, new RegExp(product.slug));
  } finally { app.DB.close(); }
});
