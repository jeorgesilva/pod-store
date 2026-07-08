import { Hono } from "hono";
import { getPayment, verifyWebhookSignature } from "../lib/mercadopago";
import { getPodProvider } from "../lib/pod";
import type { PrintfulWebhookPayload } from "../lib/pod/printful";
import type { Env } from "../types";

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
// Point this at a webhook registered via Printful's `POST /webhooks` API
// (see README.md for the exact call — Printful's API-only "manual order"
// stores don't have a dashboard webhook UI) for these event types:
// order_created, order_updated, order_failed, order_canceled,
// package_shipped. Confirmed against the official docs, not guessed:
// https://developers.printful.com/docs/#tag/Webhook-management-API
webhooksRoute.post("/pod", async (c) => {
  const payload = await c.req.json<PrintfulWebhookPayload>();
  // Order-status events carry the order at data.order; package_shipped
  // carries it there too, alongside data.shipment for tracking info.
  const order = payload.data.order;
  if (!order?.external_id) {
    return c.json({ error: "missing_order_reference" }, 400);
  }
  const orderId = order.external_id; // this is OUR order id, set at createOrder time

  // Printful's order.status enum (draft/inreview/pending/failed/canceled/
  // onhold/inprocess/partial/fulfilled) has no "shipped" or "delivered"
  // value — those come from separate events instead. Printful also has no
  // delivery-confirmation webhook at all, so 'delivered' is never reached
  // automatically; it stays at 'shipped' until updated manually.
  let mappedStatus: string;
  let podLastStatus: string;
  if (payload.type === "package_shipped") {
    mappedStatus = "shipped";
    podLastStatus = "package_shipped";
  } else if (payload.type === "order_canceled") {
    mappedStatus = "cancelled";
    podLastStatus = "order_canceled";
  } else if (order.status === "fulfilled") {
    mappedStatus = "shipped";
    podLastStatus = order.status;
  } else {
    // draft/inreview/pending/onhold/inprocess/partial/failed and anything
    // else all mean "still with Printful, not shipped yet".
    mappedStatus = "in_production";
    podLastStatus = order.status;
  }

  const trackingUrl = payload.data.shipment?.tracking_url;

  await c.env.DB.prepare(
    `UPDATE orders
       SET status = ?, pod_last_status = ?, updated_at = datetime('now')
           ${trackingUrl ? ", tracking_url = ?" : ""}
     WHERE id = ?`
  )
    .bind(
      ...(trackingUrl
        ? [mappedStatus, podLastStatus, trackingUrl, orderId]
        : [mappedStatus, podLastStatus, orderId])
    )
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
    `SELECT oi.id, oi.quantity, oi.artwork_url, oi.pod_template_id, p.pod_product_uid
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?`
  )
    .bind(orderId)
    .all<{
      id: string;
      quantity: number;
      artwork_url: string | null;
      pod_template_id: number | null;
      pod_product_uid: string;
    }>();

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
      artworkUrl: item.artwork_url ?? undefined,
      printfulTemplateId: item.pod_template_id ?? undefined,
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
