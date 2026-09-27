// Native disclosure preserves keyboard and no-JavaScript navigation.
const menus = [...document.querySelectorAll('.account-menu')];
for (const menu of menus) {
  menu.addEventListener('toggle', () => {
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
