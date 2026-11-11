// Shared by the page shell and client so navigation keeps the same visual.
export function authMotion(text) {
  const label=String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<div class="signin-scene" aria-hidden="true"><div class="signin-orbit orbit-one"></div><div class="signin-orbit orbit-two"></div><div class="signin-tile"><img src="/assets/lyverne-monogram.png" alt="" width="64" height="64"></div><span class="signin-spark"></span></div><div class="signin-caption"><p class="eyebrow">LYVERNE / YOUR EVERYDAY</p><p class="loader-text">${label}</p><span class="signin-progress" aria-hidden="true"><i></i></span></div>`;
}
