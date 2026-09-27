// Request-time rendering of the per-product pages.
//
// These pages did not exist before: the collection was a single URL holding
// every product, so no product could rank for its own name. Each product now
// has /collection/<slug>/ with its own title, description, social card and
// Product structured data.
//
// The markup deliberately reuses the classes from the existing product dialog
// -- .product-gallery, .product-info, .price-line, .size-selector, .add-to-bag
// -- so the page inherits the established design rather than introducing a
// second visual language. Only layout glue is new, in public/product.css.

import {money} from './catalog.js';
import {filters, accountMenu, dialogs, siteNav} from './shell.js';
import {
  esc, jsonLd, metaTags, productMeta, productSchema,
  breadcrumbs, organisation, productUrl, assetUrl,
} from './seo.mjs';

const CATEGORY_LABEL = {SIGNATURE: 'The quiet signature', GRAPHIC: 'The graphic edition', 'GRAPHIC EDITION': 'The graphic edition'};

// One catalog card, shared by the build-time collection page and the Worker's
// live re-render so the two can never drift apart.
//
// The card is an <a> to the product page, not a <button> opening a dialog.
// That matters for search: a page reachable only from sitemap.xml is orphaned,
// and orphaned pages rank poorly. A real link is also what makes the catalog
// work with JavaScript disabled.
export function catalogCard(p, index = 0) {
  const href = `/collection/${p.slug}/`;
  const price = p.price === null || p.price === undefined ? 'PRICE TBA' : money(p.price);
  const reverse = p.back ? '' : 'catalog-closeup';
  return `<article class="catalog-card" style="--order:${index % 4}"><a class="catalog-product" href="${esc(href)}" data-pid="${esc(p.id)}" aria-label="View ${esc(p.name)} in ${esc(p.color)}"><span class="catalog-image"><img class="catalog-front" ${index < 4 ? 'data-eager-image' : 'loading="lazy"'} src="${esc(assetUrl(p.image))}" alt="${esc(p.name)}, ${esc(p.color)}, front mockup" width="1254" height="1254"><span style="--detail-origin:${esc(p.detailFocus || '68% 31%')}" class="catalog-reverse ${reverse}"><img src="${esc(assetUrl(p.back || p.image))}" alt="" width="1254" height="1254" loading="lazy"></span><span class="catalog-view">${p.back ? 'FRONT / BACK' : 'VIEW PIECE'} ↗︎</span></span><span class="catalog-meta"><span class="catalog-title">${esc(p.name)}</span><span class="catalog-price">${esc(price)}</span><span class="catalog-color"><i style="background:${esc(p.swatch || '#20201c')}"></i>${esc(p.color)}</span><span class="catalog-category">${esc(p.category || 'SIGNATURE')}</span></span></a></article>`;
}

export const GRID_START = '<!--products:start-->';
export const GRID_END = '<!--products:end-->';

// Rebuilds the two catalog sections from live rows, preserving the chapter
// headings between them.
export function catalogGrid(products) {
  const graphic = products.filter(p => (p.category || '').toUpperCase().includes('GRAPHIC'));
  const signature = products.filter(p => !(p.category || '').toUpperCase().includes('GRAPHIC'));
  const section = (label, cards) => cards.join('\n');
  return [
    '<div class="catalog-chapter"><h2>THE GRAPHIC EDITION</h2><p>FOUR ORIGINAL DESIGNS / 01–04</p></div>',
    `<section class="catalog-products" id="collection" aria-label="Lyverne graphic designs">${section('graphic', graphic.map((p, i) => catalogCard(p, i)))}</section>`,
    '<div class="catalog-chapter signature-chapter"><h2>THE QUIET SIGNATURE</h2><p>ONE EVERYDAY SHAPE / FOUR COLORS</p></div>',
    `<section class="catalog-products" aria-label="Signature Tee colorways">${section('signature', signature.map((p, i) => catalogCard(p, i + 4)))}</section>`,
  ].join('');
}

function header() {
  return siteNav;
}

function footer() {
  return `<footer class="catalog-footer"><a href="/" aria-label="Lyverne home"><img src="/assets/lyverne-navbar.png" alt="LYVERNE" width="3715" height="925"></a><span>ALL RIGHTS RESERVED © 2026</span><a href="/studio/">Style studio</a><a href="#main">Back to top ↑</a></footer>`;
}

// The gallery shows front and back when a back image exists. Both are real
// <img> tags rather than CSS backgrounds so Google Images can index them and
// the page still shows the product with JavaScript disabled.
function gallery(product) {
  const views = [
    {src: assetUrl(product.image), label: 'FRONT', alt: `${product.name} in ${product.color}, front view`},
    ...(product.back ? [{src: assetUrl(product.back), label: 'BACK', alt: `${product.name} in ${product.color}, back view`}] : []),
  ];
  return `<div class="product-page-gallery">${views.map((v, i) => `<figure class="product-page-view"><img src="${esc(v.src)}" alt="${esc(v.alt)}" width="1254" height="1254" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}><figcaption class="view-label">${v.label}</figcaption></figure>`).join('')}</div>`;
}

function info(product) {
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  const inStock = product.stock > 0;
  const priced = product.price !== null && product.price !== undefined;
  return `<div class="product-info product-page-info">
<p class="eyebrow">LYVERNE / ${esc(CATEGORY_LABEL[product.category] || product.category)}</p>
<h1>${esc(product.name)}</h1>
<p class="color-line"><i class="color-swatch" style="background:${esc(product.swatch || '#20201c')}" aria-hidden="true"></i>${esc(product.color)}</p>
<p class="product-description">${esc(product.description)}</p>
<div class="price-line"><strong>${priced ? esc(money(product.price)) : 'PRICE TBA'}</strong><span>${inStock ? 'IN STOCK' : 'SOLD OUT'}</span></div>
${sizes.length ? `<fieldset class="size-selector"><legend>SELECT SIZE</legend><div>${sizes.map(s => `<button type="button" data-size="${esc(s)}" aria-pressed="false">${esc(s)}</button>`).join('')}</div></fieldset><p class="size-error" role="alert"></p>` : ''}
<button class="add-to-bag" data-add-product="${esc(product.id)}"${inStock && priced ? '' : ' disabled'}>${inStock && priced ? 'ADD TO BAG' : 'NOT AVAILABLE YET'} <span aria-hidden="true">↗︎</span></button>
<details><summary>Fit and fabric <span aria-hidden="true">+</span></summary><p>A relaxed, dropped-shoulder silhouette with room to move. Cut for everyday wear, not for trying too hard.</p></details>
<details><summary>Delivery and returns <span aria-hidden="true">+</span></summary><p>Delivered across Bangladesh. Orders are confirmed by Lyverne before dispatch; payment and delivery details are arranged directly with you.</p></details>
</div>`;
}

function related(origin, others) {
  if (!others.length) return '';
  return `<section class="product-page-related" aria-labelledby="related-heading">
<div class="catalog-chapter"><h2 id="related-heading">MORE FROM THE COLLECTION</h2><p>KEEP LOOKING</p></div>
<div class="product-page-related-grid">${others.map(p => `<article class="catalog-card"><a class="catalog-product" href="${esc(productUrl(origin, p))}" aria-label="View ${esc(p.name)} in ${esc(p.color)}"><span class="catalog-image"><img class="catalog-front" src="${esc(assetUrl(p.image))}" alt="${esc(p.name)}, ${esc(p.color)}" width="1254" height="1254" loading="lazy"></span><span class="catalog-meta"><span class="catalog-title">${esc(p.name)}</span><span class="catalog-price">${p.price !== null && p.price !== undefined ? esc(money(p.price)) : 'PRICE TBA'}</span><span class="catalog-color">${esc(p.color)}</span></span></a></article>`).join('')}</div>
</section>`;
}

export function productPage({product, origin, others = [], campaignEnabled = true}) {
  const {title, description} = productMeta(product);
  const path = `/collection/${product.slug}/`;
  const head = [
    metaTags({origin, path, title, description, image: product.image, type: 'product'}),
    jsonLd(productSchema(origin, product)),
    jsonLd(breadcrumbs(origin, [
      {name: 'Home', path: '/'},
      {name: 'Collection', path: '/collection/'},
      {name: `${product.name} — ${product.color}`, path},
    ])),
    jsonLd(organisation(origin)),
  ].join('');

  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#F3EEE4"><title>${esc(title)}</title>${head}<link rel="icon" href="/assets/lyverne-monogram.png"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/transitions.css"><link rel="stylesheet" href="/site-nav.css"><link rel="stylesheet" href="/collection.css"><link rel="stylesheet" href="/product.css"><link rel="stylesheet" href="/account-menu.css">${campaignEnabled ? '<link rel="stylesheet" href="/promotion-popup.css">' : ''}<script type="module" src="/transitions.js"></script><script type="module" src="/app.js"></script><script type="module" src="/account-menu.js"></script>${campaignEnabled ? '<script type="module" src="/promotion-popup.js"></script>' : ''}<script type="module" src="/product-page.js"></script></head>
<body class="collection-page product-page">
${filters}
<a class="skip-link" href="#main">Skip to product</a>
${header()}
<main id="main">
<nav class="product-page-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/collection/">Collection</a> <span aria-hidden="true">/</span> <span aria-current="page">${esc(product.name)} — ${esc(product.color)}</span></nav>
<div class="product-page-layout">${gallery(product)}${info(product)}</div>
${related(origin, others)}
</main>
${footer()}
${dialogs}
</body></html>`;
}

// 404 for an unknown or unpublished slug. Served as a real 404 so a draft or
// archived product is never indexed, and so a mistyped URL does not quietly
// return a 200 page that Google would add to the index.
export function productNotFound(origin) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Piece not found — LYVERNE</title><meta name="robots" content="noindex"><link rel="icon" href="/assets/lyverne-monogram.png"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/site-nav.css"><link rel="stylesheet" href="/collection.css"><link rel="stylesheet" href="/product.css"></head>
<body class="collection-page product-page">
${header()}
<main id="main" class="product-page-missing">
<p class="eyebrow">LYVERNE / 404</p>
<h1>THIS PIECE<br>ISN'T HERE.</h1>
<p>It may have sold out, or the link may be out of date. The rest of the collection is waiting.</p>
<a class="oval-link" href="/collection/">Back to the collection <span aria-hidden="true">↗︎</span></a>
</main>
${footer()}
</body></html>`;
}
