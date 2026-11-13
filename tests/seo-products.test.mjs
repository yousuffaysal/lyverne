import test from 'node:test';
import assert from 'node:assert/strict';
import {productKind,productMeta,descriptionLead,lowestPrice,productSchema} from '../server/seo.mjs';

const tee = (over = {}) => ({
  id: 'p1', slug: 'oathbound-oversized-tee-jet-black', name: 'OATHBOUND Oversized Tee', color: 'Jet Black',
  category: 'SIGNATURE', price: 666, discount_type: 'percent', discount_value: 25, stock: 5, sizes: ['M', 'L', 'XL'],
  image: '/assets/tee-front.png', back: '', images: [{url: '/assets/tee-front.png', label: 'Front'}],
  description: '# **OATHBOUND Oversized Tee**\n\n*Some marks are given. Others are earned.*\n\nA drop-shoulder fit.',
  seo_title: '', seo_description: '', ...over,
});

test('the kind of tee uses the words people search with', () => {
  assert.equal(productKind(tee()), 'Oversized Drop Shoulder T-Shirt');
  assert.equal(productKind(tee({name: 'QUIET STORM Raglan Tee', description: 'Calm face.'})), 'Raglan T-Shirt');
  // "No oversized graphics" in the copy must not make a regular tee oversized.
  assert.equal(productKind(tee({name: 'MARK ONE Essential Tee', description: 'No oversized graphics. Just the mark.'})), 'T-Shirt');
});

test('the snippet skips the heading that repeats the product name', () => {
  assert.equal(descriptionLead(tee()), 'Some marks are given.');
});

test('generated titles and descriptions carry search terms, price and stay in length', () => {
  const {title, description} = productMeta(tee());
  assert.ok(title.length <= 70, title);
  assert.match(title, /OATHBOUND Oversized Tee — Jet Black/);
  assert.match(title, /Drop Shoulder T-Shirt/);
  assert.ok(description.length <= 158, description);
  assert.match(description, /oversized drop shoulder t-shirt/);
  assert.match(description, /Now ৳500 \(was ৳666\)/);
  assert.doesNotMatch(description, /Tee Some marks/);
});

test('owner-written SEO text always wins', () => {
  const {title, description} = productMeta(tee({seo_title: 'Custom title', seo_description: 'Custom description.'}));
  assert.equal(title, 'Custom title');
  assert.equal(description, 'Custom description.');
});

test('a discount is marked up as a strikethrough price', () => {
  const offer = productSchema('https://lyverne.com', tee()).offers;
  assert.equal(offer.price, '500');
  assert.equal(offer.priceSpecification.priceType, 'https://schema.org/StrikethroughPrice');
  assert.equal(offer.priceSpecification.price, '666');
  assert.equal(productSchema('https://lyverne.com', tee({discount_type: 'none', discount_value: 0})).offers.priceSpecification, undefined);
});

test('the collection quotes its real lowest price', () => {
  assert.equal(lowestPrice([tee(), tee({price: 1800, discount_type: 'none', discount_value: 0}), tee({price: null})]), 500);
  assert.equal(lowestPrice([]), null);
});
