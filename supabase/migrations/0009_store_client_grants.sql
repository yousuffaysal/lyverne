-- The application uses the verified Worker for writes. RLS constrains rows,
-- but does not protect private columns or operations such as TRUNCATE.
-- Remove unused client privileges; the backend table owner is unaffected.
REVOKE ALL ON products,orders,order_events,activity,promotions,shop_settings,
  custom_orders,admin_tasks,admin_messages,schema_migrations FROM anon,authenticated;

GRANT SELECT ON products TO anon,authenticated;
-- Existing row policies still restrict these reads to the signed-in customer.
-- Internal staff notes and idempotency keys are never client-readable.
GRANT SELECT (id,customer_id,items,subtotal,discount,promo_code,total,status,payment,
  address,phone,alternate_phone,division,district,thana,postcode,local_area,
  delivery_note,tracking_number,carrier,delivery_date,version,created_at,updated_at)
  ON orders TO authenticated;
GRANT SELECT ON order_events TO authenticated;

-- Account ownership and staff roles remain writable only through the Worker.
REVOKE ALL ON customers FROM anon,authenticated;
GRANT SELECT ON customers TO authenticated;
GRANT UPDATE (name,phone,address,city,postcode,wishlist) ON customers TO authenticated;
