// Search-engine surface: canonical URLs, social cards, structured data,
// robots.txt and sitemap.xml.
//
// The goal is a Bangladeshi clothing brand that Google can read without running
// JavaScript. Two things matter most and were both missing before:
//   * every product needs its own indexable URL -- one /collection/ page
//     competing for every product query ranks for none of them;
//   * Product structured data with price, currency and availability is what
//     earns the price and stock annotations in search results.
//
// SITE_ORIGIN is injected rather than hardcoded so moving from a workers.dev
// subdomain to a real domain changes one environment variable, not this file.

import {money} from './catalog.js';
import {webAssets} from './web-assets.js';

export const FALLBACK_ORIGIN = 'https://lyverne.example';

export function siteOrigin(env = {}) {
  const raw = (env.SITE_ORIGIN || '').trim().replace(/\/+$/, '');
  if (!raw) return FALLBACK_ORIGIN;
  return /^https?:\/\//.test(raw) ? raw : 'https://' + raw;
}

// HTML-escape. Product copy is owner-supplied, so it reaches the page as text
// and must never be able to open a tag or close an attribute.
export const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

// JSON-LD sits inside <script>, where the parser looks for a literal "</script"
// before any JSON rules apply. Escaping '<' as \u003c closes that injection.
export const jsonLd = data =>
  `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`;

// The build converts most /assets/*.png to .webp and deletes the PNG, but
// product rows in the database still hold the .png path. Normalising here keeps
// every emitted URL pointing at a file that actually exists in the build.
// Uploaded images under /media/ are served as stored and are left alone.
export function assetUrl(path) {
  const match = /^\/assets\/([a-z0-9-]+)\.png$/i.exec(path || '');
  return match && webAssets.has(match[1]) ? `/assets/${match[1]}.webp` : path;
}

export const productUrl = (origin, product) => `${origin}/collection/${product.slug}/`;
export const absolute = (origin, path) => (/^https?:\/\//.test(path) ? path : origin + assetUrl(path));

// --------------------------------------------------------------- meta tags

export function metaTags({origin, path = '/', title, description, image, type = 'website', noindex = false}) {
  const url = absolute(origin, path);
  const tags = [
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="${esc(type)}">`,
    `<meta property="og:site_name" content="LYVERNE">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:locale" content="en_BD">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
  ];
  if (image) {
    const src = absolute(origin, image);
    tags.push(`<meta property="og:image" content="${esc(src)}">`);
    tags.push(`<meta property="og:image:alt" content="${esc(title)}">`);
    tags.push(`<meta name="twitter:image" content="${esc(src)}">`);
  }
  // Account pages hold nothing worth indexing and would dilute the storefront.
  if (noindex) tags.push('<meta name="robots" content="noindex, nofollow">');
  return tags.join('');
}

// ---------------------------------------------------------- structured data

export function organisation(origin) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: 'Lyverne',
    url: origin + '/',
    logo: absolute(origin, '/assets/lyverne-monogram.png'),
    slogan: 'A little less noise. A little more you.',
    description: 'Lyverne is a Bangladeshi clothing label making relaxed, considered everyday pieces.',
    address: {'@type': 'PostalAddress', addressCountry: 'BD', addressLocality: 'Dhaka'},
    areaServed: {'@type': 'Country', name: 'Bangladesh'},
  };
}

export function website(origin) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    url: origin + '/',
    name: 'LYVERNE',
    inLanguage: 'en-BD',
    publisher: {'@id': `${origin}/#organization`},
  };
}

export function breadcrumbs(origin, trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: step.name,
      item: absolute(origin, step.path),
    })),
  };
}

// Availability and price are what produce the rich result. A product with no
// price is still described, but omits offers rather than advertising a price
// of zero, which would be a false claim in search results.
export function productSchema(origin, product) {
  const url = productUrl(origin, product);
  const images = [product.image, product.back].filter(Boolean).map(i => absolute(origin, i));
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': url + '#product',
    name: `${product.name} — ${product.color}`,
    description: product.description,
    image: images,
    sku: product.id,
    category: product.category,
    color: product.color,
    brand: {'@type': 'Brand', name: 'Lyverne'},
    url,
  };
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  if (sizes.length) {
    schema.hasVariant = sizes.map(size => ({
      '@type': 'Product', name: `${product.name} — ${product.color}, ${size}`, size,
    }));
  }
  if (product.price !== null && product.price !== undefined) {
    schema.offers = {
      '@type': 'Offer',
      url,
      priceCurrency: 'BDT',
      price: String(product.price),
      availability: product.stock > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: {'@id': `${origin}/#organization`},
    };
  }
  return schema;
}

export function collectionSchema(origin, products) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${origin}/collection/#collection`,
    name: 'All Collection — Lyverne',
    url: `${origin}/collection/`,
    isPartOf: {'@id': `${origin}/#website`},
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((p, i) => ({
        '@type': 'ListItem', position: i + 1, url: productUrl(origin, p), name: `${p.name} — ${p.color}`,
      })),
    },
  };
}

// ------------------------------------------------------- robots and sitemap

export function robots(origin) {
  return [
    'User-agent: *',
    'Allow: /',
    // Account areas are private and hold nothing indexable.
    'Disallow: /admin/',
    'Disallow: /dashboard/',
    'Disallow: /login/',
    'Disallow: /signup/',
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

export function sitemap(origin, products = [], updated = new Date().toISOString()) {
  const day = value => String(value || updated).slice(0, 10);
  const entries = [
    {loc: origin + '/', priority: '1.0', changefreq: 'weekly', lastmod: day()},
    {loc: origin + '/collection/', priority: '0.9', changefreq: 'weekly', lastmod: day()},
    {loc: origin + '/studio/', priority: '0.7', changefreq: 'monthly', lastmod: day()},
    {loc: origin + '/custom/', priority: '0.8', changefreq: 'monthly', lastmod: day()},
    ...products.map(p => ({
      loc: productUrl(origin, p),
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: day(p.updated_at),
      image: absolute(origin, p.image),
      title: `${p.name} — ${p.color}`,
    })),
  ];
  const body = entries.map(e => [
    '  <url>',
    `    <loc>${esc(e.loc)}</loc>`,
    `    <lastmod>${esc(e.lastmod)}</lastmod>`,
    `    <changefreq>${esc(e.changefreq)}</changefreq>`,
    `    <priority>${esc(e.priority)}</priority>`,
    ...(e.image ? [
      '    <image:image>',
      `      <image:loc>${esc(e.image)}</image:loc>`,
      `      <image:title>${esc(e.title)}</image:title>`,
      '    </image:image>',
    ] : []),
    '  </url>',
  ].join('\n')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>\n`;
}

// Trim to a word boundary: a meta description cut mid-word ("Free-sp") looks
// broken in results and wastes the snippet.
export function clip(text, max) {
  const value = String(text ?? '').trim();
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—-]+$/, '') + '…';
}

// A product page's <title> and meta description. Owner-set overrides win, so
// the admin can tune a listing without touching code.
export function productMeta(product) {
  const name = `${product.name} — ${product.color}`;
  const priced = product.price !== null && product.price !== undefined ? ` ${money(product.price)}.` : '';
  return {
    title: clip(product.seo_title || `${name} | LYVERNE`, 70),
    description: clip(product.seo_description
      || `${product.description}${priced} Everyday wear from Lyverne, delivered across Bangladesh.`, 158),
  };
}
