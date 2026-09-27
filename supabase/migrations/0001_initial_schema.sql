-- Lyverne — Postgres schema.
-- Ported from drizzle/0000_damp_mentallo.sql + drizzle/0001_promotions.sql (D1/SQLite).
--
-- Two deliberate carry-overs from the SQLite original, so that server/worker.mjs
-- logic ports verbatim rather than being rewritten:
--   * timestamps stay ISO-8601 text. They are only ever compared with <= and >=
--     and ordered by, and ISO-8601 sorts lexicographically, so behaviour is
--     identical. Moving to timestamptz would mean rewriting every comparison in
--     promotions.mjs and domain.mjs for no behavioural gain.
--   * `active` stays integer 0/1 rather than boolean, because the Worker writes
--     Number(p.active) and guards with `active=1`.
--
-- customers.id is a uuid referencing auth.users so Supabase RLS can use auth.uid().

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- customers

create table customers (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  name       text not null,
  phone      text not null default '',
  address    text not null default '',
  city       text not null default '',
  postcode   text not null default '',
  wishlist   text not null default '[]',
  role       text not null default 'customer' check (role in ('customer', 'owner')),
  created_at text not null
);

create index idx_customers_created on customers (created_at);

-- ----------------------------------------------------------------- products

create table products (
  id          text primary key,
  slug        text not null unique,
  name        text not null,
  color       text not null,
  description text not null,
  category    text not null,
  price       integer,
  stock       integer not null default 0,
  sizes       text not null,
  image       text not null,
  back        text not null default '',
  status      text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  -- SEO fields backing the per-product pages added in phase 3.
  seo_title       text not null default '',
  seo_description text not null default '',
  version    integer not null default 1,
  created_at text not null,
  updated_at text not null
);

create index idx_products_status_created on products (status, created_at desc);

-- ------------------------------------------------------------------- orders

create table orders (
  id              text primary key,
  customer_id     uuid not null references customers (id),
  items           text not null,
  subtotal        integer,
  discount        integer not null default 0,
  promo_code      text not null default '',
  total           integer not null,
  status          text not null,
  payment         text not null default 'pending',
  address         text not null,
  phone           text not null,
  tracking_number text not null default '',
  carrier         text not null default '',
  delivery_date   text not null default '',
  note            text not null default '',
  request_key     text not null,
  version         integer not null default 1,
  created_at      text not null,
  updated_at      text not null
);

create index idx_orders_customer_created on orders (customer_id, created_at);
create index idx_orders_status on orders (status);
create unique index idx_orders_request on orders (customer_id, request_key);

-- ------------------------------------------------------------- order_events

create table order_events (
  id         text primary key,
  order_id   text not null references orders (id),
  status     text not null,
  message    text not null,
  created_at text not null
);

create index idx_events_order_created on order_events (order_id, created_at);

-- ----------------------------------------------------------------- activity

create table activity (
  id         text primary key,
  actor      uuid not null,
  action     text not null,
  target     text not null,
  created_at text not null
);

create index idx_activity_created on activity (created_at desc);

-- --------------------------------------------------------------- promotions

create table promotions (
  id          text primary key,
  code        text not null unique,
  kind        text not null,
  value       integer not null,
  minimum     integer not null default 0,
  usage_limit integer,
  used        integer not null default 0,
  starts      text not null default '',
  ends        text not null default '',
  active      integer not null default 0,
  version     integer not null default 1,
  created_at  text not null,
  updated_at  text not null
);

create index idx_promotions_active on promotions (active, starts, ends);

-- ------------------------------------------------------------ shop_settings

create table shop_settings (
  id         text primary key,
  value      text not null,
  version    integer not null default 1,
  updated_at text not null
);
