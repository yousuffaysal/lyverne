// Native disclosure preserves keyboard and no-JavaScript navigation.
const menus = [...document.querySelectorAll('.account-menu')];

// On phones the header carries only the bag and this icon, so the icon opens
// the full menu instead of a small dropdown that would crowd the screen. The
// hamburger is hidden at the same breakpoint, which is why this takes over.
const PHONE = matchMedia('(max-width: 650px)');
const menuDialog = () => document.querySelector('#menu-dialog');

for (const menu of menus) {
  const summary = menu.querySelector('summary');
  summary?.addEventListener('click', event => {
    const dialog = menuDialog();
    if (!PHONE.matches || !dialog) return;
    // Suppress the <details> toggle so the panel never flashes open first.
    event.preventDefault();
    menu.open = false;
    for (const other of document.querySelectorAll('dialog[open]')) other.close();
    dialog.showModal();
  });
  menu.addEventListener('toggle', () => {
    // A keyboard Enter on the summary opens <details> without a click event.
    if (menu.open && PHONE.matches && menuDialog()) {
      menu.open = false;
      menuDialog().showModal();
      return;
    }
    if (menu.open) for (const other of menus) if (other !== menu) other.open = false;
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      event.preventDefault(); menu.open = false; menu.querySelector('summary').focus();
    }
  });
  menu.addEventListener('click', event => { if (event.target.closest('a')) menu.open = false; });
}
document.addEventListener('click', event => {
  for (const menu of menus) if (menu.open && !menu.contains(event.target)) menu.open = false;
});
