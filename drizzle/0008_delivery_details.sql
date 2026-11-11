-- Optional delivery details preserve existing orders and customer profiles.
ALTER TABLE orders ADD COLUMN alternate_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN local_area TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN delivery_note TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN alternate_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN division TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN district TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN thana TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN local_area TEXT NOT NULL DEFAULT '';
