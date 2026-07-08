import { Hono } from "hono";
import { createPreference } from "../lib/mercadopago";
import { verifyPrintfulTemplate } from "../lib/pod/printful";
import type { CheckoutRequestBody, Env, Product } from "../types";

export const checkoutRoute = new Hono<{ Bindings: Env }>();

// POST /api/checkout
// Body: CheckoutRequestBody (see src/types.ts)
// 1) validate products + compute total from OUR OWN prices (never trust
//    a price sent by the browser)
// 2) validate each 'customizable' item's design reference server-side too
//    (never trust a Printful template id sent by the browser, same trust
//    boundary as price and as 'ready' products' default_artwork_url)
// 3) create the order + order_items rows (status: pending_payment)
// 4) create a Mercado Pago preference and return the checkout URL
checkoutRoute.post("/", async (c) => {
  const body = await c.req.json<CheckoutRequestBody>();

  if (!body.items?.length) {
    return c.json({ error: "cart_empty" }, 400);
  }

  const orderId = crypto.randomUUID();

  // Look up every product referenced by the cart in one query, then price
  // server-side — the client only ever sends productId + quantity + design.
  const productIds = [...new Set(body.items.map((i) => i.productId))];
  const placeholders = productIds.map(() => "?").join(",");
  const { results: products } = await c.env.DB.prepare(
    `SELECT * FROM products WHERE id IN (${placeholders}) AND active = 1`
  )
    .bind(...productIds)
    .all<Product>();

  const productById = new Map(products.map((p) => [p.id, p]));

  let totalCents = 0;
  const preparedItems: {
    id: string;
    productId: string;
    quantity: number;
    unitPriceCents: number;
    customization: unknown;
    title: string;
    // Exactly one of the two is set, depending on product_type — never both.
    artworkUrl: string | null;
    podTemplateId: number | null;
  }[] = [];

  for (const item of body.items) {
    const product = productById.get(item.productId);
    if (!product) {
      return c.json({ error: "invalid_product", productId: item.productId }, 400);
    }

    let artworkUrl: string | null = null;
    let podTemplateId: number | null = null;
    if (product.product_type === "ready") {
      // Never trust the client for a 'ready' product's art, same trust
      // boundary as price.
      if (!product.default_artwork_url) {
        return c.json({ error: "product_missing_artwork", productId: item.productId }, 500);
      }
      artworkUrl = product.default_artwork_url;
    } else {
      if (typeof item.printfulTemplateId !== "number") {
        return c.json({ error: "missing_design", productId: item.productId }, 400);
      }
      // Confirm this template id actually belongs to our Printful account
      // before it's used to create a paid order — never trust it blindly
      // just because the client's EDM session returned it.
      const isOwnTemplate = await verifyPrintfulTemplate(c.env, item.printfulTemplateId);
      if (!isOwnTemplate) {
        return c.json({ error: "invalid_design", productId: item.productId }, 400);
      }
      podTemplateId = item.printfulTemplateId;
    }

    totalCents += product.base_price_cents * item.quantity;
    preparedItems.push({
      id: crypto.randomUUID(),
      productId: product.id,
      quantity: item.quantity,
      unitPriceCents: product.base_price_cents,
      customization: item.customization ?? null,
      title: product.name,
      artworkUrl,
      podTemplateId,
    });
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO orders
        (id, customer_name, customer_email, customer_phone, shipping_address_json, status, total_cents)
       VALUES (?, ?, ?, ?, ?, 'pending_payment', ?)`
    ).bind(
      orderId,
      body.customer.name,
      body.customer.email,
      body.customer.phone ?? null,
      JSON.stringify(body.shippingAddress),
      totalCents
    ),
    ...preparedItems.map((item) =>
      c.env.DB.prepare(
        `INSERT INTO order_items
          (id, order_id, product_id, quantity, unit_price_cents, artwork_url, pod_template_id, customization_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        item.id,
        orderId,
        item.productId,
        item.quantity,
        item.unitPriceCents,
        item.artworkUrl,
        item.podTemplateId,
        JSON.stringify(item.customization)
      )
    ),
  ]);

  const origin = new URL(c.req.url).origin;
  const preference = await createPreference(c.env.MERCADOPAGO_ACCESS_TOKEN, {
    orderId,
    items: preparedItems.map((i) => ({
      title: i.title,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
    })),
    payerEmail: body.customer.email,
    notificationUrl: `${origin}/api/webhooks/mercadopago`,
    backUrls: {
      success: `${origin}/pedido/${orderId}?status=success`,
      failure: `${origin}/pedido/${orderId}?status=failure`,
      pending: `${origin}/pedido/${orderId}?status=pending`,
    },
  });

  await c.env.DB.prepare("UPDATE orders SET mp_payment_id = ? WHERE id = ?")
    .bind(preference.preferenceId, orderId)
    .run();

  return c.json({
    orderId,
    checkoutUrl: preference.initPoint,
  });
});
