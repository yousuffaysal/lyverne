# Lyverne

A clothing storefront with customer accounts and an owner control room based on the layout and scrolling product presentation of https://www.palmo.co.in/, adapted to Lyverne's supplied identity. Brand tokens are `#F26B24` and `#F3EEE4`.

## Local preview

```sh
npm ci
npm run build
npm run preview:start
```

Open http://127.0.0.1:4173 or http://127.0.0.1:4173/collection/. The preview starts as an independent process so a chat interruption does not stop it. Runtime logs and its PID are in ignored `.preview/` files. `npm run dev` also runs the server in the foreground. The source web root is `public/`; the build emits browser assets to `dist/client/`, a Cloudflare-compatible Worker to `dist/server/index.js`, and D1 migration metadata to `dist/.openai/`.

## Included

- Responsive editorial home, story, design details, three product views, and brand footer.
- Palmo-style home chapters: scroll-rotating circular design badges, scalloped dark panels, cycling statement text, a rotating Lyverne seal, framed colorway cards, an overlapping brand-photo collage, and a two-panel manual color carousel. The arrow and oval accents draw with animated SVG strokes. Homepage motion honors reduced-motion and the existing pause control.
- A separate collection page based on https://outfit.hellohello.is/, with an oversized wordmark, four-column desktop/two-column mobile grid, image wipe and exposure transitions, a stacked-image loading counter, and page navigation curtains. Keyboard focus receives the product reveal too; reduced-motion settings disable animation.
- The original cream navbar logo on its supplied orange rectangle on both pages.
- The supplied wordmark, monogram, and fabric-label photograph. SVG rendering filters recolor the original logo images without modifying source PNGs.
- Three original product images generated using the built-in image_gen tool: alpha-transparent front and back tee cutouts, plus a folded detail photograph. Exact prompts and source paths are in `generation-manifest.json`.
- Generated cream, charcoal, and orange concept colorways are recorded in `collection-generation-manifest.json`. All products share `public/catalog.js`; `scripts/render-collection.mjs` builds their collection markup. Black reveals its back image on hover; the new colorways reveal a closer crop.
- A Three.js depth-deformed photographic mesh with pointer tilt, gentle floating, and scroll-driven positioning. This is a 3D-style presentation, not a full 360-degree garment model or a prerecorded video. A normal image remains available when WebGL fails.
- Product-view dialog, size validation, saved shopping bag shared across pages and colorways, quantity controls, and a signed-in order-request flow.
- Keyboard-accessible native dialogs, reduced-motion preference, manual motion pause, local fonts, and self-hosted Three.js.

## Footer game — The Cut

The home footer includes an original Lyverne version of the reference's swipe-to-slice game. Branded tee cutouts launch over the footer wordmark, split along a swipe, and award 10 points with a combo multiplier up to 5×. Missing a tee or hitting the × token costs one of three lives. The round ends at zero lives and can be replayed. Desktop pointer movement slices; touch players press Play before dragging; keyboard players press Space on the playfield to slice a visible tee and P/Escape to pause. Navigation remains outside the playfield.

The game pauses offscreen, in a hidden tab, and with the page's motion control. Reduced-motion users see no ambient gameplay until they explicitly play; particle and trail effects stay disabled. Personal best is stored only on that browser, with a graceful fallback when storage is blocked. There are no purchases, prizes, accounts, or server requests in the game. Source: `public/footer-game.js`, `footer-game-model.js`, `footer-game.css`. Rules and collision checks: `node --test tests/footer-game.test.mjs`.

## Launch configuration

The original static collection remains a concept preview until imported into the owner panel. The BDT 1,800 signature price is illustrative; graphic prices remain TBA. Import creates drafts with zero stock. Confirm prices, sizes, available units, fulfillment policies and return terms before publishing a product. Published products become orderable through a signed-in request; no payment is charged. Bag data stays in browser storage until an order is requested.

To collect money or receive automatic courier updates, connect the payment and delivery providers. Recorded payment statuses are manual bookkeeping, not money movement. For a full 360-degree spin, replace the photographic mesh with an approved garment GLB and textures.

## Validation

Checked at desktop 1280×720 and mobile 390×844 and 320×740: hero and section composition, horizontal overflow, image loading, menu navigation, product views, required size validation, add/remove, quantity totals, refresh persistence, checkout disclosure, and motion pause. `npm run build` verifies all referenced local assets. Browser console was checked for errors.


## Style Studio and Graphic Edition

- `/studio/` is the local guided styling demo approved for this version. It provides 288 combinations across eight tees, four occasions, three moods, and three weather choices. The curated guide recognizes supported prompt cues and explains its limitation for unsupported requests. It is not connected to a live AI model; no text is sent to a server. Prompts are not persisted. Selected settings, a maximum of 12 saved looks, and daily challenge intent stay in browser storage.
- Original daily quotes and challenges rotate by the visitor’s local calendar day. The color playground, expandable style notes, notebook and linked product dialogs work on desktop and mobile.
- Four original graphic designs from the supplied tech pack are included alongside the four Signature colorways. Descriptive storefront names are Paper Day, Talk Less, Night Sigil and Café Orbit. The source style IDs remain in the product details. Graphic prices are unknown, so these products show Price TBA and cannot be added to the preview bag. Planned graphic sizes are M, L, XL. Conflicting GSM information in the tech pack is intentionally not published as a final specification.
- Six photorealistic transparent mockups were generated from the PDF design pages, using built-in imagegen. Exact prompts, paths and fidelity notes are in `techpack-generation-manifest.json`. These are visual previews, not print-ready masters; micro lettering, exact print placement and alpha edges may vary. The original PDF and intermediate page renders are not published.
- `studio-generation-manifest.json` records the original editorial fashion photo.
- Two silent 1080p/24 fps MP4 motion lookbooks use the generated stills with camera pans, floating product placement and crossfades. These are animated photographic edits, not generated moving-model footage. `scripts/render-films.py` reproduces them using FFmpeg. Native controls, click-to-play, no autoplay, fast-start MP4 and preview byte-range support are included.
- Homepage, collection and studio navigation share the loading/page curtain transition and orange rectangle logo.

Styling logic checks: `node --test tests/style-guide.test.mjs`. Build: `npm run build`.


## Accounts and the control room

- A visible account icon in the home, collection and Style Studio headers opens Log in, Sign up, My dashboard and Admin panel links, including on mobile. The native disclosure works without JavaScript and supports Escape and outside-click dismissal when scripts are enabled.
- Routes: `/login/`, `/signup/`, `/dashboard/`, `/admin/`. Read-only sample dashboards use `?demo=1`; sample figures are explicitly labeled and never written to the database.
- Hosted authentication uses the Sites dispatcher’s ChatGPT sign-in. Passwords are not collected. The server authorizes owner access using the private `ADMIN_EMAIL` setting matched against the trusted authenticated email header. Customer IDs scope every customer order read/write. Traditional email/password authentication is not implemented.
- Customers can edit their profile and delivery details, persist saved product IDs, request an order from the bag, and follow a timestamped five-stage delivery timeline. Tracking polls every 15 seconds while visible and not editing a field. The animation reflects recorded store updates, not invented carrier locations.
- Owner tabs include overview, orders, products, inventory, promotions, customers, analytics, AI companion, activity and settings. Product create/read/update/archive/restore is persistent. Published product edits appear in the collection; image uploads use R2. Product descriptions and names are treated as data, never HTML.
- Order prices are calculated server-side. D1 batches atomically reserve stock; idempotency keys prevent duplicate retries; optimistic versions prevent stale edits. Cancelling returns reserved units. Stock is tracked per product/colorway, shared across offered sizes, not per individual size SKU.
- Product and fulfillment changes appear in the activity log. Customer order responses omit internal notes. Order states move forward one step at a time or cancel before delivery. Payment status updates do not charge or refund money.
- Analytics use recorded paid, non-cancelled orders. Revenue is gross recorded order value, not accounting profit or a provider settlement. The seven-day chart uses UTC dates. No fictional conversion or growth rate is shown.
- The business companion offers clearly labeled deterministic store insights without a service key. Optional OpenAI Responses integration is prepared server-side; configure private `OPENAI_API_KEY` and optionally `OPENAI_MODEL` to activate it. Only aggregate metrics/product counts are automatically included; customers’ names, addresses and emails are excluded. Freeform admin questions are sent when live AI is enabled. Responses are advisory and cannot mutate store records. API implementation reference: https://developers.openai.com/api/docs/guides/text
- `.openai/hosting.json` declares logical `DB` and `BUCKET` bindings. Schema is in `db/schema.ts`; generated, reviewed migrations are in `drizzle/`. Production tables are never created at request time.
- The local preview uses a persistent SQLite database in ignored `.preview/store.sqlite` and local uploaded assets in `.preview/uploads/`. Its explicitly marked test identities are only implemented in the local preview server, never bundled into the hosted Worker. It strips incoming identity headers. `npm run build` must run before the first local preview to generate pages. Node 22+ is required locally.
- Hosting visibility follows the Site's configured sharing policy. Account and admin data are protected at the API. Never expose the Worker directly outside the Sites dispatcher without replacing its trusted-header authentication.

Validation: `node --test tests/*.test.mjs` covers access control, CSRF rejection, order ownership, stock reservation/concurrency, repeat requests, cancellation restoration, stale edits, product validation, persistent customer details, AI fallback and analytics arithmetic, plus the Style Studio logic. `npm run build` validates assets and assembles the Worker.

Large photographic assets have quality-92 WebP delivery copies at their original dimensions. Original generated PNG masters remain unchanged in source. The build switches web references to WebP and excludes duplicate PNGs from the deployment archive. `scripts/optimize-web-assets.mjs` reproduces the smaller delivery copies with FFmpeg. These use perceptual compression to fit the hosting upload time limit; original PNG files retain full pixel fidelity.

## Promotions, ordering and design guide

The home and collection pages show an opening advertisement in Lyverne's orange/cream identity. It appears once per browser session and campaign version, after page loading, and does not interrupt another dialog. The initial campaign is a brand announcement. **Admin → Promotions** controls its content, destination, enabled state and optional discount code, with a mobile-friendly preview.

Owners can create and edit percentage or fixed-BDT promo codes with minimum order values, start/end dates, usage limits and an active state. Checkout quotes and final orders both validate discounts on the server. Stock and the last code use are reserved atomically; retries do not consume additional uses. Accepted orders retain their original discount. Codes can be disabled; cancellation restores stock but does not restore a code use.

After a successful order request, an SVG ring/check animation displays the saved order ID, total and savings, with a link back to tracking. Reduced-motion users see the completed graphic. No payment is collected by this confirmation.

`DESIGN-CODE.md` documents brand tokens, page structure, components, motion, assets, APIs, authentication and extension points. `START-HERE.md` contains export setup instructions. Validation includes 29 automated tests plus desktop/mobile checks of popup dismissal, owner access, campaign editing, discounted checkout and the saved-order confirmation.

The dedicated **Admin → Promotions** dashboard shows running offers, orders using codes, recorded paid revenue, and discounts applied. Filter codes by running/scheduled/inactive/expired/exhausted status, search by code, and report over 7, 30, 90 days or all time. Each code opens its associated orders with payment and fulfillment status, ten orders per page, and direct order management. Counts include cancelled orders; paid revenue and discount totals exclude cancellations and refunds. Attribution means the saved checkout code, not advertising click attribution. The Refresh control and returning to Promotions reload current store records.
