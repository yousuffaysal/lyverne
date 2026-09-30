// Bangladesh administrative regions, for delivery addresses.
//
// Eight divisions and the sixty-four districts beneath them. This is the whole
// country, so a customer anywhere can be found, and it is the list the server
// validates against -- a district is only accepted inside the division it
// actually belongs to, which stops "Dhaka division, Cox's Bazar district"
// reaching the admin as a real address.
//
// Upazilas and unions are deliberately not here. There are around five hundred
// upazilas, and a list that large is a maintenance burden and an easy source of
// stale or wrong entries. The form asks for the thana or upazila as free text
// instead, which is what a courier reads anyway.

export const DIVISIONS = {
  Barishal: ['Barguna', 'Barishal', 'Bhola', 'Jhalokati', 'Patuakhali', 'Pirojpur'],
  Chattogram: ['Bandarban', 'Brahmanbaria', 'Chandpur', 'Chattogram', "Cox's Bazar", 'Cumilla',
    'Feni', 'Khagrachhari', 'Lakshmipur', 'Noakhali', 'Rangamati'],
  Dhaka: ['Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Kishoreganj', 'Madaripur', 'Manikganj',
    'Munshiganj', 'Narayanganj', 'Narsingdi', 'Rajbari', 'Shariatpur', 'Tangail'],
  Khulna: ['Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Khulna', 'Kushtia', 'Magura',
    'Meherpur', 'Narail', 'Satkhira'],
  Mymensingh: ['Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur'],
  Rajshahi: ['Bogura', 'Chapai Nawabganj', 'Joypurhat', 'Naogaon', 'Natore', 'Pabna', 'Rajshahi',
    'Sirajganj'],
  Rangpur: ['Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari', 'Panchagarh',
    'Rangpur', 'Thakurgaon'],
  Sylhet: ['Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet'],
};

export const DIVISION_NAMES = Object.keys(DIVISIONS);
export const DISTRICT_COUNT = Object.values(DIVISIONS).reduce((n, d) => n + d.length, 0);

// A district belongs to exactly one division, so the pair is checked together.
export function isRegion(division, district) {
  // Object.hasOwn, not a plain lookup: DIVISIONS['constructor'] resolves up the
  // prototype chain to a function, and calling .includes on it threw, turning a
  // crafted division into a 500 from the order endpoint instead of a refusal.
  if (typeof division !== 'string' || !Object.hasOwn(DIVISIONS, division)) return false;
  return DIVISIONS[division].includes(district);
}

// Bangladeshi mobile numbers are 01 followed by an operator digit (3-9) and
// eight more, optionally with +88. Landlines and short codes cannot receive a
// delivery call reliably, so the form asks for a mobile.
const MOBILE = /^(?:\+?88)?0?1[3-9]\d{8}$/;

export function normalisePhone(value) {
  const digits = String(value ?? '').replace(/[\s-()]/g, '');
  if (!MOBILE.test(digits)) return '';
  // Store one shape, so the admin can always dial it and search finds it.
  return '0' + digits.replace(/^\+?88/, '').replace(/^0/, '');
}

// Four digits, and only when given -- plenty of rural addresses have none.
export function isPostcode(value) {
  return value === '' || /^\d{4}$/.test(value);
}

// One line a courier can read, for the admin list and the order confirmation.
export function formatAddress(order) {
  return [order.address, order.thana, order.district, order.division, order.postcode]
    .map(part => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ');
}
