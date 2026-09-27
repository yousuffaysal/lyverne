-- Row Level Security.
--
-- Why this is not optional: SUPABASE_PUBLISHABLE_KEY is a public value. It ships
-- in the browser, so anyone can read it from the page source and call PostgREST
-- directly at /rest/v1/<table>. Without RLS, that request returns every row of
-- every table — all customer addresses, phone numbers, orders and promo codes.
--
-- The Worker connects as the database owner over the pooler and bypasses RLS,
-- so these policies do not constrain server/worker.mjs. They exist to make the
-- public key useless on its own: default-deny, with only the storefront's
-- genuinely public data readable, and each customer scoped to their own rows.

alter table customers     enable row level security;
alter table products      enable row level security;
alter table orders        enable row level security;
alter table order_events  enable row level security;
alter table activity      enable row level security;
alter table promotions    enable row level security;
alter table shop_settings enable row level security;

-- Enabling RLS with no policy is already deny-all. Everything below is an
-- explicit, narrow grant on top of that baseline.

-- ---------------------------------------------------------------- customers
-- A signed-in customer sees and edits exactly their own record. Note there is
-- no INSERT policy: rows are created by the Worker after it verifies the JWT,
-- so a client cannot fabricate a customer row for someone else's uuid.

create policy customers_select_self on customers
  for select to authenticated
  using (auth.uid() = id);

create policy customers_update_self on customers
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- An RLS policy authorises a row, never a column, so customers_update_self
-- alone would let a customer edit any field of their own row -- including
-- setting role='owner' on themselves. Verified: that escalation succeeds with
-- the policy alone. Column-level grants are the mechanism that stops it, so
-- revoke blanket UPDATE and re-grant only the profile fields a customer owns.
-- role, email and id are writable by the Worker (table owner) exclusively.
revoke update on customers from authenticated;
grant update (name, phone, address, city, postcode, wishlist)
  on customers to authenticated;

-- ----------------------------------------------------------------- products
-- The only genuinely public table, and only its active rows. Draft and
-- archived products stay invisible: drafts are unreleased designs, and leaking
-- them would publish the collection before launch.

create policy products_select_active on products
  for select to anon, authenticated
  using (status = 'active');

-- ------------------------------------------------------------------- orders
-- Read-only, and only your own. Orders are created and mutated solely by the
-- Worker, which enforces stock guards, version checks and idempotency. A direct
-- client INSERT would bypass all of that, so no write policy exists.

create policy orders_select_own on orders
  for select to authenticated
  using (auth.uid() = customer_id);

create policy order_events_select_own on order_events
  for select to authenticated
  using (exists (
    select 1 from orders
    where orders.id = order_events.order_id
      and orders.customer_id = auth.uid()
  ));

-- --------------------------------------------- activity, promotions, settings
-- No policies at all, so no client may read these under any key but the secret
-- one. Deliberate:
--   activity      — an audit log of owner actions.
--   promotions    — readable codes would let anyone mint their own discount by
--                   listing every unlaunched or limited offer.
--   shop_settings — the campaign is published through /api/storefront/promotion,
--                   which returns only the fields the popup needs.
