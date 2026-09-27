# Deploying Lyverne

Target: **https://lyverne.com** on Cloudflare Workers, entirely on free plans.

| Service | Plan | What it costs |
|---|---|---|
| Cloudflare Workers | Free | 100,000 requests/day |
| Cloudflare Static Assets | Free | Not counted against that quota |
| Cloudflare DNS + SSL | Free | Certificate issued automatically |
| Supabase | Free | 500MB database, 1GB storage, 50k monthly users |
| Groq | Free tier | Rate-limited, no card |

The only thing you pay for is the domain you already own.

---

## Before you start

You need the `lyverne.com` registrar login (to change nameservers) and about
40 minutes, most of which is waiting for DNS.

---

## 1. Put lyverne.com on Cloudflare

Cloudflare must run your DNS to attach a Worker to the domain.

1. Sign up at **dash.cloudflare.com** (free).
2. **Add a site** → type `lyverne.com` → choose the **Free** plan.
3. Cloudflare scans your existing DNS records. If the domain is new and empty,
   there will be nothing to import — that is fine.
4. Cloudflare shows **two nameservers**, something like
   `dana.ns.cloudflare.com` and `rex.ns.cloudflare.com`.
5. Log in to whoever you bought `lyverne.com` from, find **Nameservers** (often
   under DNS settings), remove the existing ones and enter Cloudflare's two.
6. Save, then wait. Propagation is usually under an hour but can take 24.
   Cloudflare emails you when the domain is active.

Check progress with:

```sh
dig +short NS lyverne.com
```

When that prints the Cloudflare nameservers, continue.

---

## 2. Sign in to Wrangler

Wrangler is Cloudflare's deploy tool. It needs no install — `npx` fetches it.

```sh
cd ~/Downloads/lyverne
npx wrangler login
```

A browser window opens. Authorise it, then confirm:

```sh
npx wrangler whoami
```

---

## 3. Set the secrets

Four values must never sit in a file. Each command prompts for the value and
stores it encrypted at Cloudflare; nothing is echoed or written to disk.

```sh
npx wrangler secret put DATABASE_URL
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put AI_API_KEY
npx wrangler secret put ADMIN_EMAIL
```

The values are the ones in your local `.env`. For `DATABASE_URL`, paste the
whole URI including the `%40`-encoded password — an unencoded `@` breaks it.

The remaining configuration is public and already in `wrangler.toml`:
`SITE_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `AI_BASE_URL`,
`AI_MODEL`. The publishable key belongs there: it is served to every browser by
design, and row-level security denies it everything but active products.

---

## 4. Point Supabase at the live domain

**Skip this and sign-in will break in production.** Supabase refuses to send
people to a URL it does not recognise, so magic links and Google sign-in fail.

In the Supabase dashboard → **Authentication** → **URL Configuration**:

- **Site URL**: `https://lyverne.com`
- **Redirect URLs**: add all of these

```
https://lyverne.com/**
https://www.lyverne.com/**
http://127.0.0.1:4173/**
```

The last line keeps local development working.

---

## 5. Deploy

```sh
npm run build
npx wrangler deploy
```

The build stamps `SITE_ORIGIN` from `.env` into every canonical, sitemap entry
and JSON-LD block, so **always build before deploying** — otherwise the live
site advertises the wrong domain to Google.

You get a `*.workers.dev` URL immediately. Open it: the storefront, the
collection and the product pages should all work. Sign-in will not yet, because
step 4 only allowed `lyverne.com`.

---

## 6. Attach the domain

Once Cloudflare reports `lyverne.com` as active:

1. Dashboard → **Workers & Pages** → **lyverne** → **Settings** → **Domains & Routes**
2. **Add** → **Custom Domain** → enter `lyverne.com` → Add
3. Repeat for `www.lyverne.com` if you want it to resolve

Cloudflare creates the DNS records and issues the TLS certificate. Give it a
few minutes, then:

```sh
curl -sI https://lyverne.com | head -3
curl -s https://lyverne.com/robots.txt
```

---

## 7. Confirm the database is migrated

The schema and row-level security were already applied to your Supabase
project. To verify, or after changing `supabase/migrations/`:

```sh
node --env-file=.env scripts/migrate.mjs
```

It is safe to re-run: applied migrations are recorded and skipped.

RLS is what stops the public key reading your customer table. Confirm it is on:

```sh
curl -s "https://thgogjkistktzcdujlcx.supabase.co/rest/v1/customers?select=*" \
  -H "apikey: sb_publishable_BNTa1XmFXrCJgG8U2lddHA_H7SIhI5o"
```

That must return `[]`. **If it returns customer rows, stop and re-run the
migration** — your customer addresses and phone numbers are public.

---

## 8. Tell Google the site exists

1. **search.google.com/search-console** → Add property → **Domain** → `lyverne.com`
2. It asks for a DNS TXT record. Cloudflare → **DNS** → add the record → Verify.
3. **Sitemaps** → submit `sitemap.xml`
4. **URL Inspection** → paste `https://lyverne.com/` → **Request indexing**

Indexing takes days to weeks for a new domain. Nothing makes it instant.

---

## Deploying again

```sh
npm run build && npx wrangler deploy
```

Roll back from the dashboard under **Deployments**, or:

```sh
npx wrangler rollback
```

---

## If something breaks

**Live logs:**

```sh
npx wrangler tail
```

**The site loads but the database does not** — `DATABASE_URL` is wrong or
unencoded. Re-run `npx wrangler secret put DATABASE_URL`. Check `wrangler tail`
for `ETIMEDOUT`.

**Sign-in redirects somewhere wrong** — step 4 was skipped or the URL does not
match exactly, including `https://`.

**Product images 404** — `npm run build` was not run before deploying. The
build generates `server/web-assets.js`, which maps `.png` paths stored in the
database onto the `.webp` files that ship.

**Everything 404s** — `run_worker_first` is missing from `wrangler.toml`.
Without it Cloudflare serves static files directly and the Worker never runs.

---

## Free-plan limits worth knowing

- **100,000 requests/day.** Static assets do not count, so this is effectively
  API calls and rendered pages. Far beyond a launching brand.
- **10ms CPU per request.** Waiting on the database or Groq does not count,
  only computation. Page rendering is well inside this, but it is the limit you
  would hit first if you add heavy server-side work.
- **Supabase pauses a free project after 7 days of no activity.** One click to
  restore. Real traffic prevents it.

---

## Still to do after launch

1. **Set prices on the four GRAPHIC EDITION products.** They are `null`, so
   they produce no `offers`, cannot earn a rich result and cannot enter Google
   Merchant Center. Half the catalogue is invisible to shopping surfaces.
2. **Rate-limit `/api/assistant` and `/api/checkout/quote`** — Cloudflare →
   Security → WAF → Rate limiting rules. The first is an unauthenticated AI
   endpoint that spends your Groq quota; the second lets someone guess promo
   codes.
3. **Enable Google sign-in** — it is built but needs a Google Cloud OAuth client
   ID, and has never been run.
4. **Replace the generated product mockups with real photography** before
   submitting a Merchant Center feed. AI-generated imagery risks disapproval.
