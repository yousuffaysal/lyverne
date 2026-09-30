-- Let the chief choose which pieces appear on the homepage.
--
-- The "EXPLORE ALL COLORS" grid was three cards hardcoded into index.html, so
-- changing it meant editing and redeploying the site. It now comes from the
-- database like every other product surface.
--
-- One nullable-free integer rather than a flag plus an order column: 0 means
-- the piece is not on the homepage, and 1, 2, 3 ... are its position. That
-- makes "show it, third from the left" a single value the admin form can set,
-- and there is no state where a piece is featured but has nowhere to sit.

alter table products add column if not exists home_slot integer not null default 0;

-- Partial index: the homepage query only ever asks for the featured few, and
-- this keeps that lookup off a full scan as the catalogue grows.
create index if not exists idx_products_home_slot on products (home_slot) where home_slot > 0;
