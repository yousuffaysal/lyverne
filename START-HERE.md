# Lyverne — complete codebase

This export includes the storefront, collection, Style Studio, login/sign-up pages, customer dashboard, admin panel, opening advertisement, promo codes, animated order confirmation, footer game, server/API, database schema and migrations, original image masters, web images, videos, fonts, tests, and build scripts. The production build is also included in `dist/`.

## Run on your computer

Install Node.js 22.14 or newer, then open a terminal in this folder:

```sh
npm ci
npm run build
npm run dev
```

Open http://127.0.0.1:4173/. Keep that terminal open while using the preview. To run independently, use `npm run preview:start` instead of `npm run dev`.

- Home and footer game: `/` or `/#contact`
- Collection: `/collection/`
- Style Studio: `/studio/`
- Log in / Sign up: `/login/` and `/signup/`
- Customer dashboard: `/dashboard/`
- Admin panel: `/admin/`
- Read-only sample dashboards: add `?demo=1`

For owner controls in the local preview, open `/admin/`, choose sign in, then **Continue as test owner**. Open **Promotions** (or `/admin/#promotions`) to create codes, set discounts, filter running offers, view orders and revenue per code, and configure the opening advertisement. No discount is active by default. Production admin access is protected by the private `ADMIN_EMAIL` setting; local test identities do not grant hosted access.

The complete design and code guide is in `DESIGN-CODE.md`.

The local sign-in screen provides explicitly labeled test identities. Hosted sign-in uses ChatGPT via Sites. A different hosting provider requires replacing the trusted-header authentication and wiring its database and uploads. See `README.md` for architecture, setup, and current integration limitations.

## Checks

```sh
node --test tests/*.test.mjs
npm run build
```

Secrets, customer data, local databases, Git history and installed `node_modules` are intentionally not included. `npm ci` installs the exact dependencies recorded in `package-lock.json`. Runtime settings are documented in `.env.example`; real keys stay private. The `.openai/hosting.json` file identifies the existing Lyverne site.

The AI companion uses deterministic insights until a private OpenAI key is configured. Payments and automatic courier updates are not connected. Mockups and films are concept assets, not manufacturing masters. See `README.md` for full details.
