// The open stylist: ask anything, get a wearable look back with real colours.
//
// Deliberately not a shop assistant. The answer names garments and shades that
// exist in the world, not only pieces Lyverne sells, so it is useful to someone
// who never buys anything here.

const form = document.querySelector('#stylist-form');
if (form) {
  const field = form.querySelector('#stylist-question');
  const button = form.querySelector('button[type=submit]');
  const status = form.querySelector('.stylist-status');
  const error = form.querySelector('.error');
  const result = document.querySelector('.stylist-result');

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  // Colours arrive as hex and are painted into a style attribute, so anything
  // that is not a plain hex code is refused rather than escaped and hoped for.
  const hex = value => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '');

  function draw(look) {
    if (look.declined) {
      result.innerHTML =
        `<p class="stylist-declined">${escapeHtml(look.why)}</p>`;
      result.hidden = false;
      return;
    }
    const swatches = look.palette.map(hex).filter(Boolean);
    result.innerHTML =
      `<p class="stylist-headline">${escapeHtml(look.headline)}</p>` +
      (swatches.length
        ? `<div class="stylist-palette" role="img" aria-label="Colour palette for this look">${
            swatches.map(h => `<i style="background:${h}"></i>`).join('')}</div>`
        : '') +
      `<ol class="stylist-outfit">${look.outfit.map(piece => {
        const swatch = hex(piece.hex);
        return `<li>
          ${swatch ? `<i class="stylist-dot" style="background:${swatch}" aria-hidden="true"></i>` : '<i class="stylist-dot is-empty" aria-hidden="true"></i>'}
          <span class="stylist-part">${escapeHtml(piece.part)}</span>
          <span class="stylist-item">${escapeHtml(piece.item)}</span>
          <span class="stylist-colour">${escapeHtml(piece.colour)}</span>
        </li>`;
      }).join('')}</ol>` +
      (look.why ? `<p class="stylist-why">${escapeHtml(look.why)}</p>` : '') +
      (look.tip ? `<p class="stylist-tip"><strong>Tip</strong> ${escapeHtml(look.tip)}</p>` : '');
    result.hidden = false;
  }

  async function ask(question) {
    if (!question.trim()) { field.focus(); return; }
    error.textContent = '';
    button.disabled = true;
    status.textContent = 'Thinking…';
    try {
      const res = await fetch('/api/stylist', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({question}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The stylist is unavailable right now.');
      draw(data.look);
      status.textContent = '';
      result.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    } catch (err) {
      error.textContent = err.message;
      status.textContent = '';
    } finally {
      button.disabled = false;
    }
  }

  form.addEventListener('submit', event => { event.preventDefault(); ask(field.value); });
  // Enter sends, Shift+Enter makes a new line -- the usual chat convention.
  field.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(field.value); }
  });
  for (const example of document.querySelectorAll('.stylist-examples [data-ask]')) {
    example.addEventListener('click', () => { field.value = example.dataset.ask; ask(field.value); });
  }
}
