-- pod-store D1 schema
-- Run with: npm run db:migrate:local  (or :remote once deployed)

CREATE TABLE IF NOT EXISTS products (
  id                TEXT PRIMARY KEY,          -- your own slug, e.g. "camiseta-basica"
  name              TEXT NOT NULL,
  description       TEXT,
  base_price_cents  INTEGER NOT NULL,          -- your retail price, in cents (BRL)
  pod_product_uid   TEXT NOT NULL,             -- Gelato productUid, or Montink product id
  mockup_image_url  TEXT,                      -- blank product photo shown behind the canvas
  print_area_json   TEXT NOT NULL,             -- {"x":..,"y":..,"width":..,"height":..} in mockup px
  product_type      TEXT NOT NULL DEFAULT 'customizable',
                     -- 'customizable': customer designs it in the editor
                     -- 'ready': fixed artwork (default_artwork_url), no editor step
  default_artwork_url TEXT,                   -- print-ready file used for 'ready' products; NULL for 'customizable'
  print_width_mm    REAL,                     -- physical print area size, for the 300 DPI upload check
  print_height_mm   REAL,
  active             INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id                     TEXT PRIMARY KEY,     -- our own order id (used as orderReferenceId with the POD)
  customer_name          TEXT NOT NULL,
  customer_email         TEXT NOT NULL,
  customer_phone         TEXT,
  shipping_address_json  TEXT NOT NULL,        -- see lib/pod/types.ts PodShippingAddress
  status                 TEXT NOT NULL DEFAULT 'pending_payment',
                         -- pending_payment -> paid -> submitted_to_pod -> in_production
                         -- -> shipped -> delivered   (or cancelled / payment_failed at any point)
  total_cents            INTEGER NOT NULL,
  mp_payment_id          TEXT,                 -- Mercado Pago payment/preference id
  pod_order_id           TEXT,                 -- Gelato/Montink order id, once submitted
  pod_last_status        TEXT,                 -- raw status string from the last POD webhook
  tracking_url           TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id                 TEXT PRIMARY KEY,
  order_id           TEXT NOT NULL REFERENCES orders(id),
  product_id         TEXT NOT NULL REFERENCES products(id),
  quantity           INTEGER NOT NULL DEFAULT 1,
  unit_price_cents   INTEGER NOT NULL,
  artwork_url        TEXT NOT NULL,            -- public R2 url of the customer's finished design
  customization_json TEXT                      -- raw Fabric.js canvas JSON, kept for reprints/support
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
