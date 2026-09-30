// The team orders page: universities, clubs and companies ordering custom wear.
//
// Built the way the Style Studio is -- the nav, footer and dialogs are lifted
// from the homepage so this page carries byte-identical chrome and inherits
// every change made there. The form's own vocabulary is NOT baked in here: it
// is fetched from /api/custom-orders/options at runtime, which is the same
// list the server validates against, so the two cannot drift apart.

import {siteNav} from '../server/shell.js';
import {readFile, mkdir, writeFile} from 'node:fs/promises';

const STEPS = [
  ['01', 'Your team', 'Who the pieces are for.'],
  ['02', 'What you need', 'The piece, the count, the sizes.'],
  ['03', 'The design', 'Yours, or ours to draw.'],
  ['04', 'Getting it to you', 'When, where, and how to reach you.'],
  ['05', 'One last look', 'Check it, then send it.'],
];

export async function renderCustom() {
  const home = await readFile('public/index.html', 'utf8');
  const shared = home.slice(home.indexOf('<svg class="filter-defs"'), home.indexOf('<a class="skip-link"'));
  const link = html => html
    .replaceAll('href="#home"', 'href="/"')
    .replaceAll('href="#story"', 'href="/#story"')
    .replaceAll('href="#details"', 'href="/#details"')
    .replaceAll('href="#signature"', 'href="/#signature"')
    .replaceAll('href="#collection"', 'href="/#collection"')
    .replaceAll('href="#contact"', 'href="/#contact"');
  const footer = link(home.slice(home.indexOf('<footer id="contact"'), home.indexOf('<dialog id="menu-dialog"')));
  const dialogs = link(home.slice(home.indexOf('<dialog id="menu-dialog"'), home.indexOf('</body>')));

  const title = 'Custom Team Jerseys & Uniforms in Bangladesh | LYVERNE';
  const description = 'Custom jerseys, t-shirts and hoodies for universities, clubs and companies in Bangladesh. Send your own artwork or let Lyverne design it. From 10 pieces.';

  const stepNav = STEPS.map(([n, name], i) =>
    `<li><button type="button" class="step-dot" data-goto="${i}" ${i ? 'disabled' : 'aria-current="step"'}><i aria-hidden="true"><span>${n}</span></i>${name}</button></li>`).join('');

  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#F3EEE4"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="https://lyverne.com/custom/"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:type" content="website"><meta property="og:url" content="https://lyverne.com/custom/"><meta property="og:image" content="https://lyverne.com/assets/studio-editorial.png"><link rel="icon" href="/assets/lyverne-monogram.png"><link rel="apple-touch-icon" href="/assets/lyverne-monogram.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Khand:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&display=swap"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/transitions.css"><link rel="stylesheet" href="/home.css"><link rel="stylesheet" href="/site-nav.css"><link rel="stylesheet" href="/custom.css"><link rel="stylesheet" href="/account-menu.css"><script type="module" src="/transitions.js"></script><script type="module" src="/account-menu.js"></script><script type="module" src="/custom.js"></script></head>
<body data-page="custom">
${shared}
 <a class="skip-link" href="#main">Skip to the team order form</a>
 ${siteNav}
 <main id="main">

  <section class="team-hero" aria-labelledby="team-title">
   <div class="team-hero-copy">
    <p class="eyebrow">LYVERNE / TEAM &amp; ORGANISATION ORDERS</p>
    <h1 id="team-title">ONE TEAM.<br>ONE <em>THREAD.</em></h1>
    <p class="team-lede">Jerseys for the tournament. Hoodies for the society. Shirts for the whole office.<br>Bring your own artwork, or let our designers draw it with you.</p>
    <div class="team-hero-facts">
     <div><strong>10+</strong><span>Pieces per order</span></div>
     <div><strong>Free</strong><span>Design help if you need it</span></div>
     <div><strong>All 64</strong><span>Districts delivered</span></div>
    </div>
    <a class="oval-link" href="#order-form">Start your order <span>↗︎</span></a>
   </div>
   <div class="team-hero-art">
    <figure class="editorial-frame">
     <img data-eager-image src="/assets/tee-front.png" alt="Lyverne oversized tee, the base for custom team printing" width="1254" height="1254" fetchpriority="high">
    </figure>
    <div class="team-seal" aria-hidden="true"><span>YOUR<br>CREST<br>HERE</span></div>
   </div>
  </section>

  <section class="team-how" aria-labelledby="how-title">
   <div class="team-section-head">
    <div><p class="eyebrow">HOW IT WORKS</p><h2 id="how-title">THREE STEPS.<br>NO GUESSWORK.</h2></div>
    <p>Tell us what you need. We come back with a quote and, if you want it, a design. Nothing is charged until you say yes.</p>
   </div>
   <ol class="team-steps">
    <li><span class="team-step-index">01</span><h3>YOU TELL US</h3><p>The piece, the count, the sizes and when you need them. Two minutes, and nothing is committed.</p></li>
    <li><span class="team-step-index">02</span><h3>WE COME BACK</h3><p>A price per piece and a timeline, by phone or email. If you need artwork, our designers draw it with you first.</p></li>
    <li><span class="team-step-index">03</span><h3>WE MAKE IT</h3><p>You approve the sample, we cut and print, and it reaches you anywhere in Bangladesh.</p></li>
   </ol>
  </section>

  <section class="team-order" id="order-form" aria-labelledby="form-title">
   <div class="team-section-head">
    <div><p class="eyebrow">TELL US WHAT YOU NEED</p><h2 id="form-title">LET'S BUILD<br>YOUR <em>KIT.</em></h2></div>
    <p>Five short steps. You can go back at any point, and nothing is sent until the last one.</p>
   </div>

   <div class="team-form-shell">
    <nav class="step-rail" aria-label="Order steps"><ol>${stepNav}</ol></nav>

    <form id="team-form" novalidate>
     <div class="step-progress" role="status" aria-live="polite">
      <div class="step-progress-bar"><i style="--progress:20%"></i></div>
      <p><b data-step-label>Your team</b> · step <span data-step-now>1</span> of ${STEPS.length}</p>
     </div>

     <div class="step-window">
      <!-- steps:start -->
      <p class="step-loading">Loading the form…</p>
      <!-- steps:end -->
     </div>

     <p class="error" role="alert" data-form-error></p>

     <div class="step-actions">
      <button type="button" class="btn ghost" data-back hidden>Back</button>
      <button type="button" class="btn orange" data-next>Continue <span aria-hidden="true">↗︎</span></button>
      <button type="submit" class="btn orange" data-send hidden>Send my enquiry <span aria-hidden="true">↗︎</span></button>
     </div>
    </form>

    <div class="team-done" id="team-done" hidden tabindex="-1">
     <div class="team-done-seal" aria-hidden="true">✓</div>
     <p class="eyebrow">ENQUIRY RECEIVED</p>
     <h2>THAT'S WITH US.</h2>
     <p class="team-reference" data-reference></p>
     <p>That is your reference. Keep it for when we speak.</p>
     <p class="small muted">We reply within two working days, on the number you gave us. Nothing is charged until you approve a quote.</p>
     <div class="actions"><a class="btn" href="/collection/">See the collection <span>↗︎</span></a><button type="button" class="text-btn" data-restart>Send another enquiry</button></div>
    </div>
   </div>
  </section>

  <section class="team-assure" aria-labelledby="assure-title" data-nav-theme="dark">
   <div class="scallop-edge" aria-hidden="true"><svg viewBox="0 0 1200 120" preserveAspectRatio="none"><path d="M0 120V100a100 100 0 0 1 200 0 100 100 0 0 1 200 0 100 100 0 0 1 200 0 100 100 0 0 1 200 0 100 100 0 0 1 200 0 100 100 0 0 1 200 0v20Z"/></svg></div>
   <div class="team-assure-inner">
    <p class="eyebrow">A FEW HONEST NOTES</p>
    <h2 id="assure-title">WHAT TO EXPECT.</h2>
    <dl class="team-faq">
     <div><dt>How small can an order be?</dt><dd>Ten pieces. Below that the setup costs more than the shirts.</dd></div>
     <div><dt>What does it cost?</dt><dd>It depends on the piece, the print and the count, so we quote rather than guess. You will have a number before anything is made.</dd></div>
     <div><dt>We do not have a design.</dt><dd>That is fine. Choose "Lyverne designs it" and tell us the idea — colours, the crest, the feeling. Design help is free with the order.</dd></div>
     <div><dt>How long does it take?</dt><dd>Most runs take two to three weeks from approval. Tell us your deadline and we will say plainly whether it is possible.</dd></div>
    </dl>
   </div>
  </section>

 </main>${footer}${dialogs}</body></html>`;

  await mkdir('public/custom', {recursive: true});
  await writeFile('public/custom/index.html', html);
}
