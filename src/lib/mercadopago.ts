/**
 * Mercado Pago — Checkout Pro (redirect-based preference).
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/landing
 *
 * Checkout Pro is the low-code path: you create a "preference", redirect
 * the customer to the returned `init_point` URL, and Mercado Pago handles
 * Pix/cartão/boleto and the whole payment UI for you. If you later want
 * the fully embedded flow (customer never leaves your site), look at
 * "Checkout Transparente" — it needs the MercadoPago.js SDK client-side
 * plus card tokenization, which is a bigger lift than this scaffold covers.
 */

export interface CreatePreferenceParams {
  orderId: string; // becomes external_reference, ties the payment back to your order
  items: { title: string; quantity: number; unitPriceCents: number }[];
  payerEmail: string;
  notificationUrl: string; // your /api/webhooks/mercadopago URL
  backUrls: { success: string; failure: string; pending: string };
}

export interface CreatePreferenceResult {
  preferenceId: string;
  initPoint: string; // redirect the customer here
}

export async function createPreference(
  accessToken: string,
  params: CreatePreferenceParams
): Promise<CreatePreferenceResult> {
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      external_reference: params.orderId,
      items: params.items.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        currency_id: "BRL",
        unit_price: item.unitPriceCents / 100,
      })),
      payer: { email: params.payerEmail },
      notification_url: params.notificationUrl,
      back_urls: {
        success: params.backUrls.success,
        failure: params.backUrls.failure,
        pending: params.backUrls.pending,
      },
      auto_return: "approved",
    }),
  });

  const json = await res.json<Record<string, unknown>>();

  if (!res.ok) {
    throw new Error(`Mercado Pago createPreference failed (${res.status}): ${JSON.stringify(json)}`);
  }

  return {
    preferenceId: String(json.id),
    initPoint: String(json.init_point),
  };
}

/** Fetches full payment details once a webhook tells you a payment id changed. */
export async function getPayment(accessToken: string, paymentId: string) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json<Record<string, unknown>>();
  if (!res.ok) {
    throw new Error(`Mercado Pago getPayment failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

/**
 * Verifies the `x-signature` header Mercado Pago sends on every webhook,
 * so you don't process notifications that didn't actually come from them.
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/webhooks/additional-content/your-integrations/notifications/webhooks#editor_5
 *
 * Re-check this against current docs before going live — Mercado Pago has
 * revised the exact signed-string format before.
 */
export async function verifyWebhookSignature(params: {
  xSignatureHeader: string | null;
  xRequestIdHeader: string | null;
  dataId: string;
  webhookSecret: string;
}): Promise<boolean> {
  if (!params.xSignatureHeader || !params.xRequestIdHeader) return false;

  const parts = Object.fromEntries(
    params.xSignatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k.trim(), v?.trim()];
    })
  );
  const ts = parts.ts;
  const hash = parts.v1;
  if (!ts || !hash) return false;

  const signedTemplate = `id:${params.dataId};request-id:${params.xRequestIdHeader};ts:${ts};`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(params.webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedTemplate));
  const computedHash = [...new Uint8Array(signatureBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHash === hash;
}
