-- Preserve current product images; new saves persist a labelled gallery.
ALTER TABLE products ADD COLUMN images TEXT NOT NULL DEFAULT '[]';
