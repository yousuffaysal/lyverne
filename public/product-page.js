// Size selection and add-to-bag for the server-rendered product pages.
//
// The bag itself stays owned by app.js. This module writes the same
// localStorage key and then dispatches the storage event app.js already
// listens for, so the header count, the bag dialog and the checkout flow all
// update without a second copy of the bag logic.

import {planFlight, flyToBag} from './fly-to-bag.js';
import {getToken, isSignedIn} from './auth-client.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// ------------------------------------------------------------- the view tabs
// Every view is already in the page; switching one on is just moving the
// data-active flag, so there is nothing to load and nothing to lay out again.
{
  const shots = $$('.product-page-shot');
  const tabs = $$('.product-page-gallery [data-page-view]');
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      const view = tab.dataset.pageView;
      for (const shot of shots) shot.toggleAttribute('data-active', shot.dataset.view === view);
      for (const other of tabs) other.setAttribute('aria-pressed', String(other === tab));
    });
  }
}

const addButton = $('.product-page-info .add-to-bag');
if (addButton) {
  const productId = addButton.dataset.addProduct;
  const sizeButtons = $$('.product-page-info [data-size]');
  const error = $('.product-page-info .size-error');
  let selectedSize = sizeButtons.length === 1 ? sizeButtons[0].dataset.size : '';
  if (sizeButtons.length === 1) sizeButtons[0].setAttribute('aria-pressed', 'true');

  for (const button of sizeButtons) {
    button.addEventListener('click', () => {
      selectedSize = button.dataset.size;
      for (const other of sizeButtons) other.setAttribute('aria-pressed', String(other === button));
      if (error) error.textContent = '';
    });
  }

  let quantity = 1;
  const stepButtons = $$('[data-step]');
  const updateQuantity = () => {
    $('[data-quantity]').textContent = String(quantity).padStart(2, '0');
    for (const button of stepButtons) button.disabled = Number(button.dataset.step) < 0 ? quantity === 1 : quantity === 99;
  };
  for (const button of stepButtons) button.addEventListener('click', () => {
    quantity = Math.max(1, Math.min(99, quantity + Number(button.dataset.step)));
    updateQuantity();
  });
  if (stepButtons.length) updateQuantity();

  function addToBag(checkout = false) {
    if (addButton.disabled) return;
    if (!selectedSize) {
      if (error) error.textContent = 'Choose a size to add your tee.';
      sizeButtons[0]?.focus();
      return;
    }
    // Measured before the bag changes, so the count has not popped yet.
    const flight = planFlight($('.product-page-shot[data-active]'));
    let bag = [];
    try { bag = JSON.parse(localStorage.getItem('lyverne-bag') || '[]'); } catch { bag = []; }
    if (!Array.isArray(bag)) bag = [];
    const existing = bag.find(i => i && i.id === productId && i.size === selectedSize);
    if (existing) existing.quantity = Math.min(99, Number(existing.quantity) + quantity);
    else bag.push({id: productId, size: selectedSize, quantity});
    const value = JSON.stringify(bag);
    try { localStorage.setItem('lyverne-bag', value); } catch { /* private mode: bag lasts this visit */ }
    // app.js owns rendering; this is the event it already reacts to.
    const badge = $('.site-nav .bag-count');
    const before = badge?.textContent;
    window.dispatchEvent(new StorageEvent('storage', {key: 'lyverne-bag', newValue: value}));
    const after = badge?.textContent;
    if (checkout) { location.assign('/dashboard/?checkout=1'); return; }
    // On a phone the piece flies to the bag rather than the full-screen bag
    // panel taking over the product you are still reading about. The count is
    // held at its old value until the piece lands.
    if (flight) {
      if (badge) badge.textContent = before;
      flyToBag(flight, {onArrive: () => { if (badge) badge.textContent = after; }});
    } else $('.bag-toggle')?.click();
  }
  addButton.addEventListener('click', () => addToBag());
  $('[data-buy-now]')?.addEventListener('click', () => addToBag(true));
}


// Use the same account wishlist as the dashboard.
const saveButton = $('[data-save-product]');
if (saveButton) {
  const notify = message => {
    const toast = $('.toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 3500);
  };
  const request = async (path, options = {}) => {
    const token = await getToken();
    const response = await fetch(path, {...options, headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})}});
    if (!response.ok) throw new Error('Could not update saved pieces. Please try again.');
    return response.json();
  };
  const readWishlist = user => {
    try { const items = JSON.parse(user?.wishlist || '[]'); return Array.isArray(items) ? items : []; } catch { return []; }
  };
  const paint = items => {
    const saved = items.includes(saveButton.dataset.saveProduct);
    saveButton.setAttribute('aria-pressed', String(saved));
    saveButton.setAttribute('aria-label', saved ? 'Remove from saved pieces' : 'Save this piece');
  };
  if (isSignedIn()) request('/api/me').then(({user}) => paint(readWishlist(user))).catch(() => {});
  saveButton.addEventListener('click', async () => {
    if (!isSignedIn()) { location.assign(`/login/?return_to=${encodeURIComponent(location.pathname)}`); return; }
    saveButton.disabled = true;
    try {
      const {user} = await request('/api/me');
      const current = readWishlist(user);
      const id = saveButton.dataset.saveProduct;
      const items = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
      await request('/api/wishlist', {method: 'PUT', body: JSON.stringify({items})});
      paint(items);
      notify(items.includes(id) ? 'Piece saved to your account.' : 'Piece removed from saved pieces.');
    } catch (error) { notify(error.message); }
    finally { saveButton.disabled = false; }
  });
}
