-- A delivery address a courier in Bangladesh can actually use.
--
-- Orders carried one free-text `address` box and a phone number. The address
-- was whatever the customer typed, so it often arrived without a district, and
-- the phone was stored but never shown anywhere in the admin -- which is how
-- an order could reach the owner with no usable way to deliver it.
--
-- `address` stays as the street line (house, road, area). These columns carry
-- the administrative part, validated server-side against server/bangladesh.mjs
-- so a district can only arrive inside the division it belongs to.

alter table orders add column if not exists division text not null default '';
alter table orders add column if not exists district text not null default '';
alter table orders add column if not exists thana    text not null default '';
alter table orders add column if not exists postcode text not null default '';

-- The admin filters the board by where things are going.
create index if not exists idx_orders_district on orders (district);
