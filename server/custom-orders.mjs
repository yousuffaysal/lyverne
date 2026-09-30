// Bulk and custom orders: the enquiry a university, club or company sends when
// they want team wear made.
//
// This module is the single definition of what the form may contain. The page
// builds its steps from these same lists (served by /api/custom-orders/options),
// so a choice can never appear in the form that the server would reject.

import {Problem, str} from './domain.mjs';
import {isRegion, normalisePhone} from './bangladesh.mjs';

export const ORG_TYPES = {
  university: 'University or college',
  school: 'School',
  club: 'Club or society',
  company: 'Company or office',
  event: 'Event or tournament',
  other: 'Something else',
};

export const PRODUCTS = {
  jersey: 'Sports jersey',
  tshirt: 'T-shirt',
  hoodie: 'Hoodie or sweatshirt',
  polo: 'Polo shirt',
  jacket: 'Jacket',
  other: 'Something else',
};

export const DESIGN_ROUTES = {
  own: 'We have the artwork ready',
  lyverne: 'We would like Lyverne to design it',
  idea: 'We have an idea, not a design yet',
};

export const SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

// A run below this is not worth cutting and sewing separately; above it, the
// quantity is almost certainly a typo.
export const MIN_QUANTITY = 10;
export const MAX_QUANTITY = 5000;

const STATUSES = ['new', 'reviewing', 'quoted', 'confirmed', 'closed'];
export const STATUS_LABELS = {
  new: 'New enquiry', reviewing: 'Looking into it', quoted: 'Quote sent',
  confirmed: 'Confirmed', closed: 'Closed',
};
export const isStatus = value => STATUSES.includes(value);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Only somewhere a design can actually be fetched from. A javascript: or data:
// URL in a field the admin will click is the thing to keep out.
function designLink(value) {
  const raw = str(value, 500);
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw new Problem('That design link does not look like a web address.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Problem('Share the design as an https:// link.');
  return url.toString().slice(0, 500);
}

// The size breakdown. Keys are checked against SIZES so the object cannot be
// used to smuggle arbitrary keys into storage, and the total has to agree with
// the quantity, which is the number the quote is built from.
function sizeBreakdown(input, quantity) {
  const out = {};
  let total = 0;
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const size of SIZES) {
      const n = Number(input[size]);
      if (!n) continue;
      if (!Number.isInteger(n) || n < 0 || n > MAX_QUANTITY)
        throw new Problem('Size counts must be whole numbers.');
      out[size] = n;
      total += n;
    }
  }
  if (total && total !== quantity)
    throw new Problem(`Your size counts add up to ${total}, but the total quantity says ${quantity}.`);
  return out;
}

export function customOrderInput(b) {
  const orgType = Object.hasOwn(ORG_TYPES, b.org_type) ? b.org_type : 'other';
  const orgName = str(b.org_name, 160);
  const contactName = str(b.contact_name, 100);
  const email = str(b.email, 160).toLowerCase();
  const product = Object.hasOwn(PRODUCTS, b.product) ? b.product : '';
  const designRoute = Object.hasOwn(DESIGN_ROUTES, b.design_route) ? b.design_route : 'idea';
  const quantity = Number(b.quantity);

  if (!orgName) throw new Problem('Tell us which organisation this is for.');
  if (!contactName) throw new Problem('Add the name of who we should speak to.');
  if (!EMAIL.test(email)) throw new Problem('Add an email address we can reply to.');
  const phone = normalisePhone(b.phone);
  if (!phone) throw new Problem('Enter a Bangladeshi mobile number, like 01712 345678.');
  if (!product) throw new Problem('Choose what you would like made.');
  if (!Number.isInteger(quantity) || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY)
    throw new Problem(`Orders run from ${MIN_QUANTITY} to ${MAX_QUANTITY} pieces.`);

  const division = str(b.division, 40), district = str(b.district, 40);
  // Optional here -- an enquiry is not a delivery yet -- but if one is given
  // the pair still has to be real.
  if ((division || district) && !isRegion(division, district))
    throw new Problem('Choose your division and district from the list.');

  const deadline = str(b.deadline, 10);
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Problem('Choose a valid date.');

  const link = designLink(b.design_link);
  if (designRoute === 'own' && !link)
    throw new Problem('Share a link to your artwork, or choose one of the other design options.');

  return {
    org_type: orgType,
    org_name: orgName,
    contact_name: contactName,
    contact_role: str(b.contact_role, 80),
    email,
    phone,
    division,
    district,
    product,
    product_other: product === 'other' ? str(b.product_other, 100) : '',
    quantity,
    sizes: JSON.stringify(sizeBreakdown(b.sizes, quantity)),
    colours: str(b.colours, 200),
    design_route: designRoute,
    design_link: link,
    brief: str(b.brief, 2000),
    deadline,
    note: str(b.note, 2000),
  };
}

export function decodeCustomOrder(row) {
  let sizes = {};
  try { sizes = JSON.parse(row.sizes || '{}'); } catch { /* stored shape drifted; show none */ }
  return {...row, sizes};
}
