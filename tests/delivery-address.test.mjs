// The delivery address, which decides whether an order can actually be sent.
//
// Orders used to carry one free-text address box, so an order could reach the
// admin with no district and an unreachable phone number. These lock in that
// every order has somewhere to go, and that the admin is given all of it.

import test from 'node:test';
import assert from 'node:assert/strict';
import {DIVISIONS, DIVISION_NAMES, DISTRICT_COUNT, isRegion, normalisePhone, isPostcode, formatAddress}
  from '../server/bangladesh.mjs';

test('the region list is the whole country, with no district in two divisions', () => {
  assert.equal(DIVISION_NAMES.length, 8);
  assert.equal(DISTRICT_COUNT, 64);
  const all = Object.values(DIVISIONS).flat();
  assert.deepEqual(all.filter((d, i) => all.indexOf(d) !== i), [], 'a district belongs to one division');
  for (const [division, districts] of Object.entries(DIVISIONS)) {
    assert.ok(districts.length > 0, division + ' has districts');
    assert.deepEqual([...districts].sort((a, b) => a.localeCompare(b)), districts,
      division + ' is listed alphabetically, so the dropdown is scannable');
  }
});

test('a district is only valid inside its own division', () => {
  assert.equal(isRegion('Dhaka', 'Gazipur'), true);
  assert.equal(isRegion('Chattogram', "Cox's Bazar"), true);
  assert.equal(isRegion('Sylhet', 'Sylhet'), true);
  // The pair matters: both halves exist, but not together. Checking them
  // separately would let this through and send a parcel to the wrong end of
  // the country.
  assert.equal(isRegion('Dhaka', "Cox's Bazar"), false);
  assert.equal(isRegion('Rangpur', 'Khulna'), false);
  assert.equal(isRegion('Nowhere', 'Dhaka'), false);
  assert.equal(isRegion('Dhaka', 'Nowhere'), false);
  assert.equal(isRegion('', ''), false);
  assert.equal(isRegion(undefined, undefined), false);
  // Not a prototype lookup.
  assert.equal(isRegion('constructor', 'Dhaka'), false);
  assert.equal(isRegion('toString', 'Dhaka'), false);
});

test('phone numbers are normalised to one dialable shape', () => {
  assert.equal(normalisePhone('01712345678'), '01712345678');
  assert.equal(normalisePhone('+8801712345678'), '01712345678', 'country code is stripped');
  assert.equal(normalisePhone('8801912345678'), '01912345678');
  assert.equal(normalisePhone('01798-765432'), '01798765432', 'punctuation is allowed while typing');
  assert.equal(normalisePhone(' 017 1234 5678 '), '01712345678');
  for (const bad of ['01212345678', '017123456', '0171234567890', 'not a phone', '', null, undefined, '+112025550123'])
    assert.equal(normalisePhone(bad), '', JSON.stringify(bad) + ' is not a Bangladeshi mobile');
});

test('a postcode is four digits, or nothing at all', () => {
  assert.equal(isPostcode('1205'), true);
  assert.equal(isPostcode(''), true, 'plenty of rural addresses have none');
  assert.equal(isPostcode('120'), false);
  assert.equal(isPostcode('12055'), false);
  assert.equal(isPostcode('12a5'), false);
});

test('the address reads as one line a courier can follow', () => {
  assert.equal(
    formatAddress({address: 'House 4, Road 12, Dhanmondi', thana: 'Dhanmondi', district: 'Dhaka', division: 'Dhaka', postcode: '1205'}),
    'House 4, Road 12, Dhanmondi, Dhanmondi, Dhaka, Dhaka, 1205');
  // Orders placed before this existed have only the free-text line, and must
  // still render without stray commas.
  assert.equal(formatAddress({address: 'Old free-text address', thana: '', district: '', division: '', postcode: ''}),
    'Old free-text address');
  assert.equal(formatAddress({}), '');
});
