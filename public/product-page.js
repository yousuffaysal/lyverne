// Size selection and add-to-bag for the server-rendered product pages.
//
// The bag itself stays owned by app.js. This module writes the same
// localStorage key and then dispatches the storage event app.js already
// listens for, so the header count, the bag dialog and the checkout flow all
// update without a second copy of the bag logic.

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

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

  addButton.addEventListener('click', () => {
    if (addButton.disabled) return;
    if (!selectedSize) {
      if (error) error.textContent = 'Choose a size to add your tee.';
      sizeButtons[0]?.focus();
      return;
    }
    let bag = [];
    try { bag = JSON.parse(localStorage.getItem('lyverne-bag') || '[]'); } catch { bag = []; }
    if (!Array.isArray(bag)) bag = [];
    const existing = bag.find(i => i && i.id === productId && i.size === selectedSize);
    if (existing) existing.quantity = Math.min(99, Number(existing.quantity) + 1);
    else bag.push({id: productId, size: selectedSize, quantity: 1});
    const value = JSON.stringify(bag);
    try { localStorage.setItem('lyverne-bag', value); } catch { /* private mode: bag lasts this visit */ }
    // app.js owns rendering; this is the event it already reacts to.
    window.dispatchEvent(new StorageEvent('storage', {key: 'lyverne-bag', newValue: value}));
    $('.bag-toggle')?.click();
  });
}
