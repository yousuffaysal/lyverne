import {test} from 'node:test';
import assert from 'node:assert/strict';
import {slugify,productSlug} from '../server/domain.mjs';

test('builds a readable slug from name and color', () => {
  assert.equal(productSlug({name: 'Signature Onyx Tee', color: 'Onyx'}), 'signature-onyx-tee-onyx');
});

test('folds accents rather than dropping the letters', () => {
  assert.equal(slugify('Café Graphic'), 'cafe-graphic');
});

test('collapses punctuation and runs of separators', () => {
  assert.equal(slugify('  The  Quiet — Signature!!  '), 'the-quiet-signature');
});

test('never leaves a leading or trailing hyphen', () => {
  assert.equal(slugify('---hello---'), 'hello');
  assert.equal(slugify('!!!'), '');
});

test('truncates without leaving a trailing hyphen', () => {
  const out = slugify('a'.repeat(60) + ' ' + 'b'.repeat(40));
  assert.ok(out.length <= 70);
  assert.ok(!out.endsWith('-'));
});

test('falls back to a usable slug when nothing survives', () => {
  assert.equal(productSlug({name: '!!!', color: '???'}), 'piece');
});

test('slug is URL-safe for every catalog product name shape', () => {
  for (const name of ['Tee / Black', 'Tee (2026)', 'Tee #1', 'Tee & Co.']) {
    assert.match(productSlug({name, color: 'Onyx'}), /^[a-z0-9]+(-[a-z0-9]+)*$/);
  }
});
