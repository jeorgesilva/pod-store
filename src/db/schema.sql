-- pod-store D1 schema
-- Run with: npm run db:migrate:local  (or :remote once deployed)

CREATE TABLE IF NOT EXISTS products (
  id                TEXT PRIMARY KEY,          -- your own slug, e.g. "camiseta-basica"
  name              TEXT NOT NULL,
  description       TEXT,
  base_price_cents  INTEGER NOT NULL,          -- your retail price, in cents (BRL)
  pod_product_uid   TEXT NOT NULL,             -- Printful catalog variant_id (numeric, stored as text)
  mockup_image_url  TEXT,                      -- product photo shown in the catalog and cart
  print_area_json   TEXT NOT NULL,             -- {"x":..,"y":..,"width":..,"height":..} in mockup px;
                                               -- legacy, only read by public/customizer.js
  product_type      TEXT NOT NULL DEFAULT 'customizable',
                     -- 'customizable': customer designs it in the editor
                     -- 'ready': fixed artwork (default_artwork_url), no editor step
  default_artwork_url TEXT,                   -- print-ready file used for 'ready' products; NULL for 'customizable'
  print_width_mm    REAL,                     -- physical print area size; legacy, only read by
                                              -- public/customizer.js (300 DPI upload check)
  print_height_mm   REAL,
  active             INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id                     TEXT PRIMARY KEY,     -- our own order id; sent as external_reference to
                                               -- Mercado Pago and external_id to Printful, which is
                                               -- how both webhooks find the order again
  customer_name          TEXT NOT NULL,
  customer_email         TEXT NOT NULL,
  customer_phone         TEXT,
  shipping_address_json  TEXT NOT NULL,        -- CheckoutRequestBody.shippingAddress (src/types.ts)
  status                 TEXT NOT NULL DEFAULT 'pending_payment',
                         -- pending_payment -> paid -> submitted_to_pod -> in_production
                         -- -> shipped -> delivered   (or cancelled / payment_failed at any point)
  total_cents            INTEGER NOT NULL,
  mp_payment_id          TEXT,                 -- Mercado Pago preference id, set at checkout
                                               -- (despite the name, not the payment id)
  pod_order_id           TEXT,                 -- Printful order id, once submitted
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
  artwork_url        TEXT,                     -- public URL of the print file; set for 'ready' products
                                                 -- (products.default_artwork_url), NULL for 'customizable'
  pod_template_id    INTEGER,                  -- Printful Embedded Design Maker template id; set for
                                                 -- 'customizable' products, NULL for 'ready'. Exactly one
                                                 -- of artwork_url / pod_template_id is set, never both.
  customization_json TEXT                      -- legacy Fabric.js canvas JSON; always null in the
                                               -- current Embedded Design Maker flow
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
