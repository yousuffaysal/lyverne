import {renderProductDescription} from './product-markdown.mjs';
import {arrangeCollection} from './collection-layout.mjs';
import {sizeGuide} from './size-guide.mjs';
import {productImages,priceMarkup} from './domain.mjs';
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
import {filters, accountMenu, dialogs, siteNav, siteFooter} from './shell.js';
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
  const reverse = p.back ? '' : 'catalog-closeup';
  return `<article class="catalog-card" style="--order:${index % 4}"><a class="catalog-product" href="${esc(href)}" data-pid="${esc(p.id)}" aria-label="View ${esc(p.name)} in ${esc(p.color)}"><span class="catalog-image"><img class="catalog-front" ${index < 4 ? 'data-eager-image' : 'loading="lazy"'} src="${esc(assetUrl(p.image))}" alt="${esc(p.name)}, ${esc(p.color)}, front mockup" width="1254" height="1254"><span style="--detail-origin:${esc(p.detailFocus || '68% 31%')}" class="catalog-reverse ${reverse}"><img src="${esc(assetUrl(p.back || p.image))}" alt="" width="1254" height="1254" loading="lazy"></span><span class="catalog-view">${p.back ? 'FRONT / BACK' : 'VIEW PIECE'} ↗︎</span></span><span class="catalog-meta"><span class="catalog-title">${esc(p.name)}</span><span class="catalog-price">${priceMarkup(p,{compact:true})}</span><span class="catalog-color"><i style="background:${esc(p.swatch || '#20201c')}"></i>${esc(p.color)}</span><span class="catalog-category">${esc(p.category || 'SIGNATURE')}</span></span></a></article>`;
}

export const GRID_START = '<!--products:start-->';
export const GRID_END = '<!--products:end-->';

// Rebuilds the two catalog sections from live rows, preserving the chapter
// headings between them.
// ---------------------------------------------------------------- homepage
// The "EXPLORE ALL COLORS" grid. Three cards used to be written into
// index.html by hand; they now come from whichever pieces the chief gave a
// home_slot, in that order.
export const HOME_START = '<!--home-products:start-->';
export const HOME_END = '<!--home-products:end-->';

export function homeGrid(products) {
  return products.map(p => {
    // A link, not a button. These opened a quick-look dialog, which meant the
    // piece's own page -- the one with the price, the sizes and the structured
    // data Google reads -- was unreachable from the homepage.
    const href = `/collection/${p.slug}/`;
    return `<article><a class="edition-card" href="${esc(href)}" aria-label="View ${esc(p.name)} in ${esc(p.color)}">`
      + `<span class="edition-image"><img src="${esc(assetUrl(p.image))}" alt="${esc(p.name)}, ${esc(p.color)}" width="1254" height="1254" loading="lazy"></span>`
      + `<span class="edition-caption"><span class="edition-name">${esc(p.name)}</span><span class="edition-plus">+</span></span></a></article>`;
  }).join('');
}

export function catalogGrid(products,layout){
 const groups=arrangeCollection(products,layout).filter(group=>group.products.length);
 return `<div id="collection-grid">${groups.map((group,index)=>`<div class="catalog-chapter${index?' collection-chapter-spaced':''}"><h2>${esc(group.title.toUpperCase())}</h2><p>${group.products.length} ${group.products.length===1?'PIECE':'PIECES'}</p></div><section class="catalog-products" ${index===0?'id="collection"':''} data-collection-section="${group.key}" aria-label="${esc(group.title)}">${group.products.map((product,index)=>catalogCard(product,index)).join('')}</section>`).join('')}</div>`;
}

function header() {
  return siteNav;
}

function footer() {
  return `${siteFooter}`;
}

// One framed shot with the other views beside it. The same viewer the
// collection's quick-look dialog uses -- the page and the dialog were showing
// the same garment two different ways, and stacking the views meant the buy
// controls started a full screen down.
//
// Every view is a real <img> in the markup, so Google Images still has them
// all; the inactive ones are hidden with visibility rather than display, which
// keeps their boxes in layout. DETAIL is a close crop of the front unless the
// product carries its own detail photograph.
//
// Each view button holds BOTH a thumbnail and a word. A phone shows the
// thumbnails, stacked down the right of the hero; a desktop shows the words as
// the tab row it has always had. One set of buttons either way, so there is
// only ever one control per view for a screen reader to find.
function gallery(product) {
  const views=productImages(product).map((image,index)=>({view:'image-'+index,src:assetUrl(image.url),label:image.label,alt:`${product.name} in ${product.color}, ${image.label}`}));
  const origin = product.detailFocus || '65% 30%';
  const shots = views.map((v, i) => `<img class="product-page-shot${v.crop ? ' detail-crop' : ''}" data-view="${esc(v.view)}"${i === 0 ? ' data-active' : ''} src="${esc(v.src)}" alt="${esc(v.alt)}" width="1254" height="1254" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}${v.crop ? ` style="transform-origin:${esc(origin)}"` : ''}>`).join('');
  const tabs = views.map((v, i) => `<button type="button" class="pd-view" data-page-view="${esc(v.view)}" aria-pressed="${i === 0}"><img src="${esc(v.src)}" alt="" aria-hidden="true" loading="lazy"><span>${esc(v.label)}</span></button>`).join('');
  return `<div class="product-page-gallery">
<figure class="product-page-frame">${shots}</figure>
<aside class="gallery-rail" id="product-image-rail" aria-label="Product images"><button type="button" class="gallery-rail-close" data-gallery-close aria-label="Hide image views"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button><div class="gallery-tabs" role="group" aria-label="Product view">${tabs}</div></aside>
<button type="button" class="gallery-rail-toggle" data-gallery-open aria-label="Show image views" aria-controls="product-image-rail" aria-expanded="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7" y="4" width="13" height="15" rx="2"/><path d="M4 8v11a3 3 0 0 0 3 3h10M10 14l3-3 4 4M15 8h.01"/></svg></button>
</div>`;
}

// The swatch row: this piece's other colourways, each its own page. The one
// you are on is marked current rather than linked to itself.
function colourRow(product, colourways) {
  const all = colourways.length ? colourways : [product];
  if (all.length < 2) return '';
  return `<div class="pd-colours" role="group" aria-label="Colour">${all.map(c =>
    c.id === product.id
      ? `<span class="pd-colour" aria-current="true" title="${esc(c.color)}" style="--swatch:${swatch(c)}"><i aria-hidden="true"></i><em>${esc(c.color)}</em></span>`
      : `<a class="pd-colour" href="/collection/${esc(c.slug)}/" title="${esc(c.color)}" style="--swatch:${swatch(c)}"><i aria-hidden="true"></i><em>${esc(c.color)}</em></a>`
  ).join('')}</div>`;
}

// Straight from the database into a style attribute, so it is checked rather
// than trusted: anything that is not a plain hex colour becomes the default.
const HEX = /^#[0-9a-f]{3,8}$/i;
const swatch = p => (HEX.test(String(p.swatch || '')) ? p.swatch : '#20201c');

function info(product, colourways) {
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  const inStock = product.stock > 0;
  const priced = product.price !== null && product.price !== undefined;
  const buyable = inStock && priced;
  return `<div class="product-info product-page-info">
<div class="pd-headline">
<div>
<p class="eyebrow">LYVERNE / ${esc(CATEGORY_LABEL[product.category] || product.category)}</p>
<h1>${esc(product.name)}</h1>
</div>
${buyable ? `<div class="pd-quantity" role="group" aria-label="Quantity">
<button type="button" data-step="-1" aria-label="One fewer">&minus;</button>
<output data-quantity aria-live="polite">01</output>
<button type="button" data-step="1" aria-label="One more">+</button>
</div>` : ''}
</div>
<div class="pd-price-row">
<div class="price-line product-detail-price">${priceMarkup(product)}<span class="price-stock">${inStock ? 'IN STOCK' : 'SOLD OUT'}</span></div>
${colourRow(product, colourways)}
</div>
${sizes.length ? `<div class="pd-size-block"><a class="size-guide-link" href="#size-guide"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7h18v10H3zM7 7v5m5-5v3m5-3v5"/></svg>Size guide</a><fieldset class="size-selector"><legend>SELECT SIZE</legend><div>${sizes.map(s => `<button type="button" data-size="${esc(s)}" aria-pressed="false">${esc(s)}</button>`).join('')}</div></fieldset><p class="size-error" role="alert"></p></div>` : ''}
<h2 class="pd-section">Description</h2>
<div class="product-description description-markdown">${renderProductDescription(product.description)}</div>
${sizeGuide()}
<details><summary>Fit and fabric <span aria-hidden="true">+</span></summary><p>A relaxed, dropped-shoulder silhouette with room to move. Cut for everyday wear, not for trying too hard.</p></details>
<details><summary>Delivery and returns <span aria-hidden="true">+</span></summary><p>Delivered across Bangladesh. Orders are confirmed by Lyverne before dispatch; payment and delivery details are arranged directly with you.</p></details>
<div class="pd-actions">
<button class="btn-add add-to-bag" data-add-product="${esc(product.id)}"${buyable ? '' : ' disabled'}>${buyable ? 'Add to Cart' : (inStock ? 'Not available yet' : 'Sold out')}</button>
${buyable ? '<button class="btn-buy" data-buy-now>Buy Now</button>' : ''}
</div>
</div>`;
}

function related(origin, others) {
  if (!others.length) return '';
  return `<section class="product-page-related" aria-labelledby="related-heading">
<div class="catalog-chapter"><h2 id="related-heading">MORE FROM THE COLLECTION</h2><p>KEEP LOOKING</p></div>
<div class="product-page-related-grid">${others.map(p => `<article class="catalog-card"><a class="catalog-product" href="${esc(productUrl(origin, p))}" aria-label="View ${esc(p.name)} in ${esc(p.color)}"><span class="catalog-image"><img class="catalog-front" src="${esc(assetUrl(p.image))}" alt="${esc(p.name)}, ${esc(p.color)}" width="1254" height="1254" loading="lazy"></span><span class="catalog-meta"><span class="catalog-title">${esc(p.name)}</span><span class="catalog-price">${priceMarkup(p,{compact:true})}</span><span class="catalog-color">${esc(p.color)}</span></span></a></article>`).join('')}</div>
</section>`;
}

export function productPage({product, origin, others = [], colourways = [], campaignEnabled = true}) {
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

  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#F3EEE4"><title>${esc(title)}</title>${head}<link rel="icon" href="/assets/lyverne-monogram.png"><link rel="apple-touch-icon" href="/assets/lyverne-monogram.png"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/footer.css"><link rel="stylesheet" href="/transitions.css"><link rel="stylesheet" href="/site-nav.css"><link rel="stylesheet" href="/collection.css"><link rel="stylesheet" href="/product.css"><link rel="stylesheet" href="/account-menu.css">${campaignEnabled ? '<link rel="stylesheet" href="/promotion-popup.css">' : ''}<script type="module" src="/transitions.js"></script><script type="module" src="/app.js"></script><script type="module" src="/account-menu.js"></script>${campaignEnabled ? '<script type="module" src="/promotion-popup.js"></script>' : ''}<script type="module" src="/product-page.js"></script></head>
<body class="collection-page product-page">
${filters}
<a class="skip-link" href="#main">Skip to product</a>
${header()}
<main id="main">
<div class="pd-top">
<a class="pd-icon" href="/collection/" aria-label="Back to the collection"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></a>
<span class="pd-top-title">Details</span>
<button type="button" class="pd-icon pd-save" data-save-product="${esc(product.id)}" aria-pressed="false" aria-label="Save this piece"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.6-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7 2.7C19 15.4 12 20 12 20Z"/></svg></button>
</div>
<div class="product-page-layout" style="--hero:color-mix(in srgb, ${swatch(product)} 20%, var(--cream))">${gallery(product)}${info(product, colourways)}</div>
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
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Piece not found — LYVERNE</title><meta name="robots" content="noindex"><link rel="icon" href="/assets/lyverne-monogram.png"><link rel="apple-touch-icon" href="/assets/lyverne-monogram.png"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/footer.css"><link rel="stylesheet" href="/site-nav.css"><link rel="stylesheet" href="/collection.css"><link rel="stylesheet" href="/product.css"></head>
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
