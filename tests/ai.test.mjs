// The customer-facing assistant's data boundary.
//
// The bot refusing to answer "how much stock is left" is not a security
// control: it is model behaviour, and model behaviour changes between versions
// and can be talked around. The actual control is that stock counts, revenue,
// promo codes and customer records are never placed in its context at all.
// These tests assert that boundary, so it cannot be widened by accident.

import test from 'node:test';
import assert from 'node:assert/strict';
import {shopperCatalogue, aiConfigured} from '../server/ai.mjs';

const rows = [
  {
    id: 'product-secret-id', slug: 'the-signature-tee-onyx-black', name: 'The Signature Tee',
    color: 'Onyx Black', description: 'A relaxed black tee.', category: 'SIGNATURE',
    price: 1800, stock: 3, sizes: ['S', 'M'], image: '/assets/tee-front.png',
    back: '', status: 'active', version: 7,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
    seo_title: '', seo_description: '',
  },
  {
    id: 'product-draft', slug: 'unreleased', name: 'SECRET NEXT DROP', color: 'Cream',
    description: 'Not announced.', category: 'SIGNATURE', price: 2500, stock: 40,
    sizes: ['M'], image: '/assets/tee-cream.png', back: '', status: 'draft', version: 1,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
  },
];

test('unreleased products never reach the customer assistant', () => {
  const out = shopperCatalogue(rows);
  assert.equal(out.length, 1);
  assert.ok(!JSON.stringify(out).includes('SECRET NEXT DROP'));
});

test('exact stock counts are reduced to a boolean', () => {
  const [tee] = shopperCatalogue(rows);
  assert.equal(tee.available, true);
  // "only 3 left" is a business signal; the customer bot gets in stock / not.
  assert.ok(!Object.values(tee).includes(3));
  assert.equal(shopperCatalogue([{...rows[0], stock: 0}])[0].available, false);
});

test('internal columns are stripped before the prompt is built', () => {
  const serialised = JSON.stringify(shopperCatalogue(rows));
  for (const leak of ['product-secret-id', 'version', 'created_at', 'updated_at', 'seo_title', 'status']) {
    assert.ok(!serialised.includes(leak), `${leak} must not reach the model`);
  }
});

test('the catalogue exposes only the documented public fields', () => {
  const [tee] = shopperCatalogue(rows);
  assert.deepEqual(
    Object.keys(tee).sort(),
    ['available', 'colour', 'description', 'name', 'price', 'sizes', 'url'],
  );
});

test('an unpriced product says so rather than showing a number', () => {
  const [tee] = shopperCatalogue([{...rows[0], price: null}]);
  assert.equal(tee.price, 'not yet announced');
});

test('aiConfigured reflects whether a key is present', () => {
  assert.equal(aiConfigured({}), false);
  assert.equal(aiConfigured({AI_API_KEY: ''}), false);
  assert.equal(aiConfigured({AI_API_KEY: 'gsk_x'}), true);
});
