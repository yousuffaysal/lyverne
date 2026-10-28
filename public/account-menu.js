// The profile icon's menu.
//
// It shows what you can actually do right now rather than a fixed list: signed
// out you get a way in, signed in you get your account, order tracking and a
// way out. The owner also gets the store admin. On a phone the same menu opens
// as a sheet, because the header there is only the profile and bag icons.

import * as auth from './auth-client.js';

const menus = [...document.querySelectorAll('.account-menu')];

// --------------------------------------------------------- disclosure basics

for (const menu of menus) {
  menu.addEventListener('toggle', () => {
    if (menu.open) for (const other of menus) if (other !== menu) other.open = false;
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      event.preventDefault(); menu.open = false; menu.querySelector('summary')?.focus();
    }
  });
  // Close on a link, but leave it open for a button that acts in place.
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) menu.open = false;
  });
}
document.addEventListener('click', event => {
  for (const menu of menus) if (menu.open && !menu.contains(event.target)) menu.open = false;
});

// ------------------------------------------------------------- menu contents

const ARROW = '<span aria-hidden="true">↗︎</span>';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

function render(user) {
  const signedIn = !!user;
  const items = signedIn
    ? [
        ['/dashboard/', 'My account', ARROW],
        ['/dashboard/#tracking', 'Track an order', ARROW],
        ...(user.admin ? [['/admin/', 'Store admin', ARROW]] : []),
      ]
    : [
        ['/login/', 'Log in', ARROW],
        ['/signup/', 'Sign up', '<span aria-hidden="true">＋</span>'],
      ];

  for (const menu of menus) {
    const panel = menu.querySelector('.account-panel');
    if (!panel) continue;
    const heading = signedIn ? (user.name || 'Your account') : 'Your account';
    panel.innerHTML =
      `<p>${escapeHtml(heading).toUpperCase()}</p>` +
      items.map(([href, label, icon]) => `<a href="${href}">${label} ${icon}</a>`).join('') +
      (signedIn ? '<button type="button" class="account-action" data-sign-out>Sign out</button>' : '');
  }

  // The phone header has no profile icon -- it is the bag and the menu -- so
  // the menu carries the one account row instead. It is a link, not a sign
  // in / sign out pair: signed out, the dashboard does the asking.
  const row = document.querySelector('[data-menu-account]');
  if (row) row.textContent = signedIn ? (user.name || 'My account') : 'My account';
  const admin = document.querySelector('[data-menu-admin]');
  if (admin) admin.hidden = !(signedIn && user.admin);
}

// The session is held in localStorage, not a cookie, so the token has to be
// attached explicitly -- a bare fetch looks anonymous to the server.
async function whoAmI() {
  try {
    const token = await auth.getToken();
    const res = await fetch('/api/me', {
      headers: {'Cache-Control': 'no-cache', ...(token ? {Authorization: 'Bearer ' + token} : {})},
    });
    if (!res.ok) return null;
    return (await res.json()).user ?? null;
  } catch { return null; }
}

// Draw the signed-out menu immediately so the icon is never empty, then correct
// it once the server says who this is.
render(null);
whoAmI().then(render);

// ------------------------------------------------------------------- actions

document.addEventListener('click', async event => {
  const out = event.target.closest('[data-sign-out]');
  if (out) {
    event.preventDefault();
    out.disabled = true;
    try { await auth.signOut(); } catch { /* the local session is cleared regardless */ }
    location.assign('/');
  }
});

// app.js owns the menu dialog wherever it is loaded. The account pages do not
// load it, which left their Menu button doing nothing at all -- so bind it here
// only when app.js is absent, to avoid two handlers fighting over one dialog.
if (!document.querySelector('script[src="/app.js"]')) {
  const toggle = document.querySelector('.site-nav .menu-toggle');
  const dialog = document.querySelector('#menu-dialog');
  if (toggle && dialog) {
    toggle.addEventListener('click', () => {
      for (const open of document.querySelectorAll('dialog[open]')) open.close();
      dialog.showModal();
      toggle.setAttribute('aria-expanded', 'true');
    });
    dialog.addEventListener('close', () => toggle.setAttribute('aria-expanded', 'false'));
    for (const close of dialog.querySelectorAll('[data-close]')) close.addEventListener('click', () => dialog.close());
    for (const link of dialog.querySelectorAll('a')) link.addEventListener('click', () => dialog.close());
  }
}

// The nav markup is shared by every page, so the active link is marked here
// from the pathname rather than baked into each generated page.
{
  const path = location.pathname;
  for (const link of document.querySelectorAll('.site-nav nav > a[data-nav]')) {
    const target = link.dataset.nav;
    const active = target === '/' ? path === '/' : path.startsWith(target);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
