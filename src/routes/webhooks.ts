import { Hono } from "hono";
import { getPayment, verifyWebhookSignature } from "../lib/mercadopago";
import { getPodProvider } from "../lib/pod";
import type { Env } from "../types";
import type { GelatoWebhookPayload } from "../lib/pod/gelato";

export const webhooksRoute = new Hono<{ Bindings: Env }>();

// POST /api/webhooks/mercadopago
// Configure this exact URL as the notification_url in your Mercado Pago
// application settings. Mercado Pago calls it on every payment status
// change (pending -> approved/rejected, refunds, etc).
webhooksRoute.post("/mercadopago", async (c) => {
  const url = new URL(c.req.url);
  const type = url.searchParams.get("type") ?? (await c.req.json().catch(() => ({})))?.type;
  const dataId =
    url.searchParams.get("data.id") ??
    (await c.req.json().catch(() => ({})))?.data?.id;

  if (type !== "payment" || !dataId) {
    // Mercado Pago also sends other topics (merchant_order, etc) — ignore them.
    return c.body(null, 200);
  }

  const isValid = await verifyWebhookSignature({
    xSignatureHeader: c.req.header("x-signature") ?? null,
    xRequestIdHeader: c.req.header("x-request-id") ?? null,
    dataId: String(dataId),
    webhookSecret: c.env.MERCADOPAGO_WEBHOOK_SECRET,
  });
  if (!isValid) {
    return c.json({ error: "invalid_signature" }, 401);
  }

  const payment = await getPayment(c.env.MERCADOPAGO_ACCESS_TOKEN, String(dataId));
  const orderId = String(payment.external_reference);
  const paymentStatus = String(payment.status); // approved | pending | rejected | ...

  const order = await c.env.DB.prepare("SELECT * FROM orders WHERE id = ?")
    .bind(orderId)
    .first<{ id: string; status: string }>();

  if (!order) {
    return c.json({ error: "order_not_found", orderId }, 404);
  }

  if (paymentStatus === "approved") {
    if (order.status === "pending_payment") {
      await c.env.DB.prepare("UPDATE orders SET status = 'paid', updated_at = datetime('now') WHERE id = ?")
        .bind(orderId)
        .run();
      // Fire-and-continue: submit to the POD provider now that we've been paid.
      await submitOrderToPod(c.env, orderId);
    }
  } else if (paymentStatus === "rejected" || paymentStatus === "cancelled") {
    await c.env.DB.prepare(
      "UPDATE orders SET status = 'payment_failed', updated_at = datetime('now') WHERE id = ?"
    )
      .bind(orderId)
      .run();
  }

  return c.body(null, 200);
});

// POST /api/webhooks/pod
// Point this at Gelato's webhook config (Dashboard -> Developers ->
// Webhooks) for order status events. If you switch to Montink, adapt the
// payload parsing below to whatever shape their webhook actually sends —
// the `orders` table update logic stays the same either way.
webhooksRoute.post("/pod", async (c) => {
  const payload = await c.req.json<GelatoWebhookPayload>();
  const orderId = payload.orderReferenceId; // this is OUR order id, set at createOrder time

  if (!orderId) {
    return c.json({ error: "missing_order_reference" }, 400);
  }

  const statusMap: Record<string, string> = {
    printed: "in_production",
    shipped: "shipped",
    delivered: "delivered",
    cancelled: "cancelled",
  };
  const mappedStatus = statusMap[payload.fulfillmentStatus] ?? "in_production";

  await c.env.DB.prepare(
    "UPDATE orders SET status = ?, pod_last_status = ?, updated_at = datetime('now') WHERE id = ?"
  )
    .bind(mappedStatus, payload.fulfillmentStatus, orderId)
    .run();

  return c.body(null, 200);
});

/** Loads an order's items and submits them to whichever POD provider is
 *  configured. Called right after payment is confirmed. */
async function submitOrderToPod(env: Env, orderId: string) {
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first<{
    id: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string | null;
    shipping_address_json: string;
  }>();
  if (!order) throw new Error(`submitOrderToPod: order ${orderId} not found`);

  const { results: items } = await env.DB.prepare(
    `SELECT oi.id, oi.quantity, oi.artwork_url, p.pod_product_uid
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?`
  )
    .bind(orderId)
    .all<{ id: string; quantity: number; artwork_url: string; pod_product_uid: string }>();

  const shipping = JSON.parse(order.shipping_address_json) as {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postCode: string;
    country: string;
  };
  const [firstName, ...rest] = order.customer_name.split(" ");

  const pod = getPodProvider(env);
  const result = await pod.createOrder({
    orderReferenceId: order.id,
    customerReferenceId: order.customer_email,
    currency: env.STORE_CURRENCY,
    items: items.map((item) => ({
      itemReferenceId: item.id,
      productUid: item.pod_product_uid,
      artworkUrl: item.artwork_url,
      quantity: item.quantity,
    })),
    shippingAddress: {
      firstName,
      lastName: rest.join(" ") || firstName,
      addressLine1: shipping.addressLine1,
      addressLine2: shipping.addressLine2,
      city: shipping.city,
      state: shipping.state,
      postCode: shipping.postCode,
      country: shipping.country,
      email: order.customer_email,
      phone: order.customer_phone ?? undefined,
    },
  });

  await env.DB.prepare(
    "UPDATE orders SET status = 'submitted_to_pod', pod_order_id = ?, pod_last_status = ?, updated_at = datetime('now') WHERE id = ?"
  )
    .bind(result.providerOrderId, result.status, orderId)
    .run();
}
