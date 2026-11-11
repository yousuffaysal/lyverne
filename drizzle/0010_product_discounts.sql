-- Product discounts are separate from order promo codes. Existing prices stay unchanged.
ALTER TABLE products ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'none' CHECK (discount_type IN ('none','percent','fixed'));
ALTER TABLE products ADD COLUMN discount_value INTEGER NOT NULL DEFAULT 0 CHECK (discount_value >= 0);
