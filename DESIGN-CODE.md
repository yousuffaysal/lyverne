# Lyverne — design and implementation guide

This is the design/code map for the complete project. Start with `START-HERE.md` to run it and `README.md` for capabilities and integration limits.

## Identity

- Brand: **LYVERNE**. Use the supplied logo, not a replacement typeface.
- Orange: `#F26B24` / `--orange`.
- Warm cream: `#F3EEE4` / `--cream`.
- Ink: `#20201C` / `--ink`.
- Home display type: locally hosted **Khand Bold**. Supporting text: **Manrope**.
- Keep the original cream navbar wordmark inside its orange rectangle. The large footer wordmark uses an SVG color filter applied to the supplied transparent image.
- Preserve relaxed product silhouettes, generous space, large editorial typography, fine borders, hand-drawn oval/arrow accents, scalloped transitions, and orange emphasis.
- Keep visible text focused on the shopper's next decision. Product previews and sample data must be clearly identified.

## Routes and responsibilities

| Route | Source / generator | Purpose |
| --- | --- | --- |
| `/` | `public/index.html`, `home.css`, `home.js` | Brand story, product chapters, films and footer game |
| `/collection/` | `scripts/render-collection.mjs`, `collection.css`, `collection.js` | Collection grid, image reveal and product exploration |
| `/studio/` | `scripts/render-studio.mjs`, `studio.js`, `style-guide.js` | Guided local styling, quotes, saved inspiration |
| `/login/`, `/signup/` | `scripts/render-accounts.mjs`, `workspace.js` | Account entry and profile onboarding |
| `/dashboard/` | Same account generator + `workspace.js` | Orders, checkout, tracking, profile and saved pieces |
| `/admin/` | Same account generator + `workspace.js`, `promotions-admin.js` | Owner controls and store insights |

Generated route HTML is committed for convenience. Edit its generator, then run `npm run build`; do not change only generated HTML.

## Shared components

- `public/style.css`: base identity, storefront dialogs and shopping bag.
- `public/workspace.css`: dashboard layouts, forms, tables, tracking, checkout and confirmation.
- `public/account-menu.css` / `.js`: native account disclosure with Log in, Sign up, My dashboard and Admin panel links; outside-click and Escape dismissal. Header markup in the home document is shared by collection and studio generators.
- `public/transitions.css` / `.js`: loading sequence and navigation curtain.
- `public/catalog.js`: source catalog shared by storefront and server; live products hydrate from `/api/products`.
- `public/app.js`: product selection, sizes, device-local shopping bag and checkout entry.
- `public/product-scene.js`: Three.js photographic depth effect. This is not a complete 360° garment model.
- `public/films.js`: user-initiated videos with native controls.

## Opening advertisement

`public/promotion-popup.js` and `.css` implement a branded native `<dialog>` with a product image, orange panel, cream copy area, optional code, offer terms, and a destination button.

- Reads `/api/storefront/promotion`. If loading fails, shopping remains available.
- Appears on `/` and `/collection/`, after loading, when another dialog is not open. Direct hash-linked sections are not interrupted.
- Dismissal is stored per browser session and campaign version. A campaign update may show again.
- Selecting a code stores it as a pending device preference; checkout validates it against the server.
- Default content is a brand announcement, with no invented discount. The owner configures real offers under **Admin → Promotions**.
- Popup controls: enabled state, headline, text, button label, destination, linked promo code, and preview. A linked inactive, scheduled, expired or exhausted code suppresses the popup.
- Edit visuals in the CSS. Edit default copy consistently in `server/promotions.mjs` and `public/promotions-admin.js`.

## Discounts and checkout

- Promo kinds: integer percentage (1–100) or fixed whole BDT amount.
- Owner controls: code, amount, minimum merchandise subtotal, optional maximum uses, start/end timestamps, active state. New forms default to inactive.
- Codes are case-normalized, immutable after creation, and cannot be stacked. Disable rather than delete a code to preserve records.
- `/api/checkout/quote` returns authoritative line items, subtotal, discount, code and merchandise total.
- `/api/orders` recalculates the price and checks current stock and offer eligibility again. Client totals never determine an order's price.
- The order insert, stock reservation, promo-use increment and initial tracking event run in a single D1 transaction batch. A guarded insert protects the last available stock or code use.
- Order idempotency prevents accepted retries from consuming a code twice. Uses are not restored on cancellation; stock is restored.
- Fixed discounts cannot exceed subtotal. Percentage discounts round down to whole BDT.
- Order rows retain `subtotal`, `discount` and `promo_code`, so later edits do not change past orders. Historic pre-discount orders have nullable subtotal and zero discount.
- Paid-sales analytics attribute net order revenue across line items rather than overstate discounted product revenue.
- Payment collection and automatic shipping-price calculation are not connected. UI clearly identifies merchandise totals and order requests.

## Promo code performance dashboard

**Admin → Promotions** is the dedicated management surface at `/admin/#promotions`.

- `promotionStatus` and `promotionAnalytics` in `server/domain.mjs` are copied into the browser's `commerce.js` by the build. Reports use order records returned by owner-protected APIs; there is no demo-data fallback in a real account.
- Offer status is current eligibility: running, scheduled, inactive, expired or exhausted. Lifetime uses are distinct from period-specific order counts.
- Reporting periods: rolling 7, 30 or 90 days, or all time, based on order creation timestamp. Future-dated records are excluded.
- Orders using codes include cancellations. Paid revenue uses saved net totals for paid, non-cancelled orders. Discounts applied include unpaid accepted orders, excluding cancelled/refunded records. Changes to an offer never recalculate old order discounts.
- Code search and status filters narrow the offer list. Summary cards always cover all codes in the chosen reporting period.
- **View orders** lists the associated records, ten per page, with payment/fulfillment state and order-management controls. Refunded and cancelled counts may overlap.
- **Edit discount** changes percentage/fixed value, eligibility, dates and limits. Inactive offers cannot be used at checkout.
- **Refresh** and entering the Promotions tab load current store records. The displayed update time is the latest successful load, not a claim of real-time push updates.
- The opening advertisement editor remains available in a collapsible panel under the offer list.

## SVG order confirmation

`public/order-confirmation.js` renders a confirmation only after `/api/orders` succeeds. The SVG draws an orange ring, cream check and short radial strokes in sequence. It includes the real order ID, merchandise total and any discount savings. CSS animation definitions live in `workspace.css`.

- No arbitrary timeout can claim success.
- Failed requests keep the form and show an error.
- Successful orders remain confirmed even if the following tracking refresh is temporarily unavailable.
- Reduced-motion mode shows the completed check without animation.
- “Follow my order” returns to the already selected tracking record.

## Footer game

`footer-game.js` draws branded tees over the footer wordmark; `footer-game-model.js` contains collision, score, lives and projectile logic. `footer-game.css` styles controls.

Swipe on desktop, press Play before touch dragging, or use Space to slice a visible tee and P/Escape to pause. The game offers three lives, split effects, score combos, replay and a device-local personal best. It suspends offscreen and when the tab is hidden. Page motion controls and reduced-motion preferences are respected. Studio's generator deliberately excludes home-only game markup.

## Authentication and admin access

The account menu links to `/admin/`. Anonymous visitors see an owner sign-in screen; customers cannot read or mutate admin data. The server compares the authenticated account with private `ADMIN_EMAIL`; a client link does not grant permission.

- Auth is Supabase. The browser holds a session; the Worker verifies the JWT's ES256 signature against the project's published public key on every request. Verification is local, so there is no per-request call to Supabase and the signing key never leaves it.
- **Identity is never taken from a header.** The earlier `oai-authenticated-user-*` headers were trustworthy only because the OpenAI Sites dispatcher was the sole party who could set them. Anywhere else, any client can send them, so the Worker now ignores them entirely. `tests/auth.test.mjs` asserts this and must keep passing.
- Local preview signs its labelled test identities into the real Supabase project and passes the Worker a genuine token, so development exercises the production path rather than a shortcut that could mask a hole.
- `?demo=1` is a read-only sample dashboard, never an admin login bypass.
- Real secrets belong in the Cloudflare secret store, not public JS, this ZIP or `.env`. `.env.example` documents expected names.

## Backend and storage

Supabase provides Postgres, authentication and object storage. The Worker keeps
the D1-shaped data interface it was written against, so the order transactions
and version guards are unchanged from the original implementation.

- `server/worker.mjs`: API dispatch, identity/authorization, order transactions, products, fulfillment, server-rendered pages and AI.
- `server/db.mjs`: Postgres behind the D1 `prepare/bind/first/all/run/batch` interface. Connect through the Supabase transaction pooler (port 6543), never the direct 5432 connection: Workers open many short-lived connections.
- `server/auth.mjs`: verifies Supabase ES256 JWTs against the project JWKS. Identity is never read from a request header.
- `server/storage.mjs`: Supabase Storage behind the R2 bucket interface; images are proxied through `/media/<key>` so they stay on the brand domain.
- `server/ai.mjs`: the three assistants. `shopperCatalogue()` is the data boundary for the public one.
- `server/seo.mjs`, `server/render.mjs`: canonicals, social cards, JSON-LD, sitemap, and the `/collection/<slug>/` pages.
- `server/shell.js`: generated by the build from `public/index.html`; shared page chrome for Worker-rendered pages. Do not edit by hand.
- `server/domain.mjs`: validation, statuses, slugs and analytics; copied to `public/commerce.js` during build.
- `server/promotions.mjs`: offer validation, quote calculation and campaign reads.
- `db/schema.ts`: Drizzle schema for the local SQLite preview.
- `supabase/migrations/`: the Postgres schema and the row-level security policies. Apply with `node --env-file=.env scripts/migrate.mjs`.
- `drizzle/*.sql`: migrations for the local SQLite preview only.
- Use parameterized statements. Every mutation checks same-origin requests; every admin API checks owner access. Customer orders remain scoped by authenticated user ID.

### Two rules worth keeping

- **Ownership needs two independent signals.** `ADMIN_EMAIL` is the root of trust and `customers.role` mirrors it; `isOwner()` requires both. RLS additionally revokes `UPDATE` on `customers.role` from clients, so a customer cannot promote themselves.
- **The public AI assistant is isolated by construction, not by instruction.** It receives only the whitelist in `shopperCatalogue()`. Stock is reduced to a boolean, drafts are filtered out, and internal columns never leave the server, so prompt injection has nothing to reach.

## Assets

All supplied brand assets, original generated PNG mockups, web-optimized WebP copies, local fonts, and both MP4 films are in `public/assets/`. Image prompts and provenance are recorded in the four `*-manifest.json` files. Keep PNG masters when optimizing delivery. `scripts/optimize-web-assets.mjs` generates WebP; `scripts/render-films.py` regenerates motion lookbooks with FFmpeg.

The two videos are animated photographic lookbooks, not filmed moving-model footage. Garment mockups are visual concepts rather than manufacturing artwork.

## Responsive and accessible behavior

- Design for 320px through wide desktop. Use readable text, sufficient contrast and visible focus.
- Native dialogs handle focus containment and Escape. Native account disclosure supports keyboard operation.
- Error/status messages use live regions; financial totals remain visible text.
- Dialogs scroll inside the viewport; controls remain usable on mobile.
- Honor `prefers-reduced-motion`. Never require an animation to finish before controls work.
- Do not add a promo over an open checkout or account form.

## Development and verification

```sh
npm ci
npm run build
npm run dev
node --test tests/*.test.mjs
```

Node 22.14+ is required. Default preview: `http://127.0.0.1:4173`. `LYVERNE_PORT` and `LYVERNE_PREVIEW_DATA_DIR` can point an isolated test preview at another local port and database directory. They affect only local preview scripts.

`npm run build` regenerates pages, validates asset references, copies domain/catalog modules, and writes browser output to `dist/client` and the Worker to `dist/server`. The build rewrites matching PNG paths to WebP and includes migration metadata in `dist/.openai/`.

Tests cover authorization, CRUD, stock reservation, order ownership/idempotency, cancellation, discount limits/races/expiry, campaign safety, analytics, styling and footer-game logic. Tests use isolated in-memory databases and do not change production records.

## Export and deployment

The complete ZIP contains source, assets, migration history, lockfile, tests, documentation and production build. It excludes `.git`, `node_modules`, real `.env` files, local customer databases, sessions and uploaded test data. Run `npm ci` to recreate installed dependencies.

The exported build must be deployed with its new migration before the new promotions APIs are used. Existing hosted pages may still be the previous version until publication is approved. Source upload/publication was previously blocked by automatic approval review and must not be bypassed without authorization.
