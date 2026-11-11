// Shared by the page shell and client so navigation keeps the same visual.
export function authMotion(text) {
  const label=String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<div class="auth-indicator" aria-hidden="true"><svg viewBox="0 0 80 80" fill="none"><circle class="auth-indicator-track" cx="40" cy="40" r="28"/><circle class="auth-indicator-spin" cx="40" cy="40" r="28"/><circle class="auth-indicator-done" cx="40" cy="40" r="28"/><path class="auth-indicator-check" pathLength="1" d="m29 40 8 8 15-17"/></svg></div><p class="loader-text">${label}</p>`;
}
