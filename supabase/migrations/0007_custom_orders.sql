-- Bulk and custom orders: universities, clubs, companies ordering team wear.
--
-- These are enquiries, not shop orders. Nothing is priced or reserved here --
-- a team jersey run depends on artwork, fabric and quantity, so the flow is
-- "tell us what you need, we come back with a quote". That is why this table
-- is separate from `orders` and has no stock or payment columns.
--
-- Two note columns on purpose: `note` is what the customer wrote and is never
-- edited by staff, and `admin_note` is the internal notepad. Keeping them
-- apart means an internal remark can never be mistaken for the customer's own
-- words when someone reads the enquiry back weeks later.

create table if not exists custom_orders (
  id           text primary key,
  reference    text not null unique,
  org_type     text not null default 'other',
  org_name     text not null,
  contact_name text not null,
  contact_role text not null default '',
  email        text not null,
  phone        text not null,
  division     text not null default '',
  district     text not null default '',
  product      text not null,
  product_other text not null default '',
  quantity     integer not null,
  sizes        text not null default '{}',
  colours      text not null default '',
  design_route text not null default 'idea',
  design_link  text not null default '',
  brief        text not null default '',
  deadline     text not null default '',
  note         text not null default '',
  status       text not null default 'new'
               check (status in ('new','reviewing','quoted','confirmed','closed')),
  admin_note   text not null default '',
  version      integer not null default 1,
  created_at   text not null,
  updated_at   text not null
);

create index if not exists idx_custom_status on custom_orders (status, created_at desc);
create index if not exists idx_custom_created on custom_orders (created_at desc);

-- Staff-only, reached exclusively through the Worker, which connects as the
-- table owner. RLS on with no policies means no client key reads it -- these
-- rows carry a named contact, their phone and their email.
alter table custom_orders enable row level security;
revoke all on custom_orders from anon, authenticated;
