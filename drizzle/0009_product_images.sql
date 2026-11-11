-- Existing front/back images remain available through the gallery fallback.
ALTER TABLE products ADD COLUMN images TEXT NOT NULL DEFAULT '[]';
