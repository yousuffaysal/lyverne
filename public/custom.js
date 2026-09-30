// The team order form: five steps, one question at a time.
//
// The steps are built from /api/custom-orders/options rather than written into
// the page, because that endpoint is the same list the server validates
// against. A choice can never appear here that the submission would reject.
//
// Validation runs per step, so nobody fills four screens before learning their
// phone number was wrong on the first one.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const e = v => String(v ?? '').replace(/[&<>"']/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

const form = $('#team-form');
if (form) {
  const shell = $('.step-window');
  const rail = $('.step-rail');
  const errorLine = $('[data-form-error]');
  const backBtn = $('[data-back]');
  const nextBtn = $('[data-next]');
  const sendBtn = $('[data-send]');
  const done = $('#team-done');
  const STEP_NAMES = ['Your team', 'What you need', 'The design', 'Getting it to you', 'One last look'];

  let options = null;
  let step = 0;
  const data = {sizes: {}};

  // Same rule as server/bangladesh.mjs. Checking it here is a courtesy that
  // saves a round trip; the server checks it again because this can be skipped.
  const phoneOk = v => /^(?:\+?88)?0?1[3-9]\d{8}$/.test(String(v).replace(/[\s-()]/g, ''));
  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v));

  const field = (label, control, hint = '') =>
    `<label class="team-field"><span>${label}</span>${control}${hint ? `<small>${hint}</small>` : ''}</label>`;

  const select = (name, map, value, placeholder) =>
    `<select name="${name}"><option value="">${placeholder}</option>${
      Object.entries(map).map(([k, v]) => `<option value="${e(k)}" ${value === k ? 'selected' : ''}>${e(v)}</option>`).join('')}</select>`;

  const districtsFor = division =>
    (options.divisions && Object.hasOwn(options.divisions, division)) ? options.divisions[division] : [];

  function stepMarkup(index) {
    if (index === 0) return `
      <fieldset class="team-step" aria-label="Your team">
       ${field('What kind of group is this?', select('org_type', options.orgTypes, data.org_type, 'Choose one'))}
       ${field('Organisation name', `<input name="org_name" maxlength="160" value="${e(data.org_name || '')}" placeholder="Dhaka University Football Club" autocomplete="organization">`)}
       ${field('Your name', `<input name="contact_name" maxlength="100" value="${e(data.contact_name || '')}" placeholder="Nadia Rahman" autocomplete="name">`)}
       ${field('Your role <span class="muted">(optional)</span>', `<input name="contact_role" maxlength="80" value="${e(data.contact_role || '')}" placeholder="Captain, President, HR">`)}
      </fieldset>`;

    if (index === 1) {
      const sizes = options.sizes.map(s =>
        `<label class="size-cell"><span>${e(s)}</span><input type="number" min="0" max="${options.maxQuantity}" inputmode="numeric" data-size="${e(s)}" value="${data.sizes[s] || ''}" placeholder="0"></label>`).join('');
      return `
      <fieldset class="team-step" aria-label="What you need">
       ${field('What would you like made?', select('product', options.products, data.product, 'Choose a piece'))}
       <div data-product-other ${data.product === 'other' ? '' : 'hidden'}>${field('Tell us what it is', `<input name="product_other" maxlength="100" value="${e(data.product_other || '')}" placeholder="Track pants, caps…">`)}</div>
       ${field('How many pieces?', `<input name="quantity" type="number" inputmode="numeric" min="${options.minQuantity}" max="${options.maxQuantity}" value="${e(data.quantity || '')}" placeholder="40">`, `From ${options.minQuantity} pieces.`)}
       <div class="team-field"><span>Sizes <span class="muted">(optional — you can tell us later)</span></span>
        <div class="size-grid">${sizes}</div>
        <small data-size-total>Leave blank if you do not know yet.</small></div>
       ${field('Colours <span class="muted">(optional)</span>', `<input name="colours" maxlength="200" value="${e(data.colours || '')}" placeholder="Navy body, white sleeves">`)}
      </fieldset>`;
    }

    if (index === 2) return `
      <fieldset class="team-step" aria-label="The design">
       <div class="team-field"><span>Where is the design coming from?</span>
        <div class="route-grid">${Object.entries(options.designRoutes).map(([k, v]) => `
         <label class="route-card ${data.design_route === k ? 'is-on' : ''}">
          <input type="radio" name="design_route" value="${e(k)}" ${data.design_route === k ? 'checked' : ''}>
          <strong>${e(v)}</strong>
          <small>${e({own: 'Send us the file and we print it as drawn.',
                      lyverne: 'Tell us the idea. Our designers draw it with you, free with the order.',
                      idea: 'A colour, a crest, a feeling. We will take it from there.'}[k] || '')}</small>
         </label>`).join('')}</div></div>
       <div data-design-link ${data.design_route === 'own' ? '' : 'hidden'}>
        ${field('Link to your artwork', `<input name="design_link" maxlength="500" inputmode="url" value="${e(data.design_link || '')}" placeholder="https://drive.google.com/…">`,
          'Google Drive, Dropbox or WeTransfer is fine. Make sure the link is open to anyone.')}</div>
       ${field('Anything we should know about the look? <span class="muted">(optional)</span>',
         `<textarea name="brief" rows="4" maxlength="2000" placeholder="Crest on the chest, player names and numbers on the back.">${e(data.brief || '')}</textarea>`)}
      </fieldset>`;

    if (index === 3) {
      const divisions = Object.keys(options.divisions || {});
      return `
      <fieldset class="team-step" aria-label="Getting it to you">
       ${field('Email', `<input name="email" type="email" maxlength="160" value="${e(data.email || '')}" placeholder="you@university.edu" autocomplete="email">`)}
       ${field('Mobile number', `<input name="phone" maxlength="20" inputmode="tel" value="${e(data.phone || '')}" placeholder="01712 345678" autocomplete="tel">`, 'We call this number to talk the order through.')}
       <div class="team-pair">
        ${field('Division <span class="muted">(optional)</span>', `<select name="division"><option value="">Choose</option>${divisions.map(d => `<option value="${e(d)}" ${data.division === d ? 'selected' : ''}>${e(d)}</option>`).join('')}</select>`)}
        ${field('District <span class="muted">(optional)</span>', `<select name="district"><option value="">${data.division ? 'Choose' : 'Pick a division first'}</option>${districtsFor(data.division).map(d => `<option value="${e(d)}" ${data.district === d ? 'selected' : ''}>${e(d)}</option>`).join('')}</select>`)}
       </div>
       ${field('When do you need them? <span class="muted">(optional)</span>', `<input name="deadline" type="date" value="${e(data.deadline || '')}">`)}
       <div class="team-field notepad"><span>Your notes <span class="muted">(optional)</span></span>
        <textarea name="note" rows="5" maxlength="2000" placeholder="Anything else at all — budget, a past order, who else is involved, a deadline that cannot move.">${e(data.note || '')}</textarea>
        <small>This comes through to us exactly as you write it.</small></div>
      </fieldset>`;
    }

    const row = (k, v) => v ? `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>` : '';
    const sizeText = Object.entries(data.sizes).filter(([, n]) => n).map(([s, n]) => `${s} × ${n}`).join(', ');
    return `
      <div class="team-step team-review">
       <p class="eyebrow">CHECK IT OVER</p>
       <dl>
        ${row('Organisation', data.org_name)}
        ${row('Group', options.orgTypes[data.org_type])}
        ${row('Contact', [data.contact_name, data.contact_role].filter(Boolean).join(' · '))}
        ${row('Piece', data.product === 'other' ? data.product_other || 'Something else' : options.products[data.product])}
        ${row('Quantity', data.quantity ? data.quantity + ' pieces' : '')}
        ${row('Sizes', sizeText)}
        ${row('Colours', data.colours)}
        ${row('Design', options.designRoutes[data.design_route])}
        ${row('Artwork', data.design_link)}
        ${row('Brief', data.brief)}
        ${row('Email', data.email)}
        ${row('Mobile', data.phone)}
        ${row('Where', [data.district, data.division].filter(Boolean).join(', '))}
        ${row('Needed by', data.deadline)}
        ${row('Your notes', data.note)}
       </dl>
       <p class="small muted">Sending this does not commit you to anything. We reply with a price and a timeline first.</p>
      </div>`;
  }

  // Collect whatever the current step holds before leaving it, so going back
  // and forward never loses what someone typed.
  function capture() {
    for (const el of $$('[name]', shell)) {
      if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
      else data[el.name] = el.value.trim();
    }
    for (const el of $$('[data-size]', shell)) {
      const n = Number(el.value);
      if (n > 0) data.sizes[el.dataset.size] = n; else delete data.sizes[el.dataset.size];
    }
  }

  function problem() {
    if (step === 0) {
      if (!data.org_type) return 'Choose what kind of group this is.';
      if (!data.org_name) return 'Tell us which organisation this is for.';
      if (!data.contact_name) return 'Add your name so we know who to ask for.';
    }
    if (step === 1) {
      if (!data.product) return 'Choose what you would like made.';
      if (data.product === 'other' && !data.product_other) return 'Tell us what you would like made.';
      const q = Number(data.quantity);
      if (!Number.isInteger(q) || q < options.minQuantity || q > options.maxQuantity)
        return `Orders run from ${options.minQuantity} to ${options.maxQuantity} pieces.`;
      const total = Object.values(data.sizes).reduce((a, b) => a + b, 0);
      if (total && total !== q) return `Your sizes add up to ${total}, but the total says ${q}.`;
    }
    if (step === 2) {
      if (!data.design_route) return 'Tell us where the design is coming from.';
      if (data.design_route === 'own' && !data.design_link) return 'Share a link to your artwork, or pick another option.';
      if (data.design_link && !/^https?:\/\//i.test(data.design_link)) return 'The design link should start with https://';
    }
    if (step === 3) {
      if (!emailOk(data.email)) return 'Add an email address we can reply to.';
      if (!phoneOk(data.phone)) return 'Enter a Bangladeshi mobile number, like 01712 345678.';
      if (data.division && !data.district) return 'Pick your district too, or clear the division.';
    }
    return '';
  }

  // Movement is a short slide in the direction of travel. Anyone who has asked
  // for reduced motion gets the same steps without it -- handled in custom.css.
  function render(direction = 1) {
    shell.innerHTML = stepMarkup(step);
    const panel = $('.team-step', shell);
    panel.style.setProperty('--from', direction > 0 ? '26px' : '-26px');
    panel.classList.add('is-entering');
    requestAnimationFrame(() => panel.classList.remove('is-entering'));

    $('.step-progress-bar i').style.setProperty('--progress', ((step + 1) / STEP_NAMES.length * 100) + '%');
    $('[data-step-now]').textContent = step + 1;
    $('[data-step-label]').textContent = STEP_NAMES[step];
    $$('.step-dot', rail).forEach((dot, i) => {
      dot.disabled = i > step;
      dot.classList.toggle('is-done', i < step);
      if (i === step) dot.setAttribute('aria-current', 'step'); else dot.removeAttribute('aria-current');
    });
    backBtn.hidden = step === 0;
    nextBtn.hidden = step === STEP_NAMES.length - 1;
    sendBtn.hidden = !nextBtn.hidden;
    errorLine.textContent = '';
    updateSizeTotal();
    const first = $('input,select,textarea', shell);
    if (first && step > 0) first.focus({preventScroll: true});
  }

  function updateSizeTotal() {
    const out = $('[data-size-total]', shell);
    if (!out) return;
    const total = $$('[data-size]', shell).reduce((n, el) => n + (Number(el.value) || 0), 0);
    const want = Number($('[name=quantity]', shell)?.value) || 0;
    out.textContent = !total ? 'Leave blank if you do not know yet.'
      : want && total !== want ? `${total} of ${want} pieces — these should match.`
      : `${total} pieces.`;
    out.classList.toggle('is-off', !!(total && want && total !== want));
  }

  function go(to, direction) {
    capture();
    if (direction > 0) {
      const why = problem();
      if (why) {
        errorLine.textContent = why;
        const bad = $('input,select,textarea', shell);
        if (bad) bad.focus({preventScroll: true});
        return;
      }
    }
    step = to;
    render(direction);
    // Keep the step under the reader's eye on a phone, where the form is taller
    // than the screen.
    $('.team-form-shell').scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  nextBtn.addEventListener('click', () => go(Math.min(step + 1, STEP_NAMES.length - 1), 1));
  backBtn.addEventListener('click', () => go(Math.max(step - 1, 0), -1));
  rail.addEventListener('click', ev => {
    const dot = ev.target.closest('[data-goto]');
    if (dot && !dot.disabled) go(Number(dot.dataset.goto), Number(dot.dataset.goto) > step ? 1 : -1);
  });

  shell.addEventListener('input', ev => {
    if (ev.target.matches('[data-size],[name=quantity]')) updateSizeTotal();
  });
  shell.addEventListener('change', ev => {
    if (ev.target.name === 'product') {
      data.product = ev.target.value;
      $('[data-product-other]', shell).hidden = ev.target.value !== 'other';
    }
    if (ev.target.name === 'design_route') {
      data.design_route = ev.target.value;
      $('[data-design-link]', shell).hidden = ev.target.value !== 'own';
      $$('.route-card', shell).forEach(c => c.classList.toggle('is-on', c.contains(ev.target)));
    }
    if (ev.target.name === 'division') {
      data.division = ev.target.value; data.district = '';
      const list = districtsFor(data.division);
      $('[name=district]', shell).innerHTML =
        `<option value="">${list.length ? 'Choose' : 'Pick a division first'}</option>` +
        list.map(d => `<option value="${e(d)}">${e(d)}</option>`).join('');
    }
  });

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    capture();
    errorLine.textContent = '';
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';
    try {
      const res = await fetch('/api/custom-orders', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...data, quantity: Number(data.quantity)}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'We could not send that. Please try again.');
      $('[data-reference]').textContent = body.reference;
      form.hidden = true;
      rail.hidden = true;
      done.hidden = false;
      done.focus();
      done.scrollIntoView({behavior: 'smooth', block: 'center'});
    } catch (err) {
      errorLine.textContent = err.message;
      sendBtn.disabled = false;
      sendBtn.innerHTML = 'SEND MY ENQUIRY <span>↗︎</span>';
    }
  });

  $('[data-restart]')?.addEventListener('click', () => location.reload());

  (async () => {
    try {
      options = await (await fetch('/api/custom-orders/options')).json();
      render(1);
    } catch {
      shell.innerHTML = '<p class="step-loading">The form could not load. Please refresh, or email us and we will take it from there.</p>';
      nextBtn.hidden = true;
    }
  })();
}
