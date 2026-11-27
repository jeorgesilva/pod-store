/**
 * LEGACY: kept for historical reference only, not part of the active flow.
 *
 * Gelato was this store's print-on-demand provider before the migration to
 * Printful. The active adapter is ../printful.ts (POD_PROVIDER = "printful"
 * in wrangler.toml). This file still compiles and can still be selected
 * with POD_PROVIDER = "gelato" (see ../index.ts), but nothing runs it
 * today. It only sends flat print-file URLs and has no support for
 * Printful Embedded Design Maker templates, so it couldn't fulfil the
 * current 'customizable' products anyway.
 */
import type {
  CreatePodOrderParams,
  CreatePodOrderResult,
  PodOrderStatusResult,
  PodProvider,
} from "../types";

/**
 * Gelato order API, v4. Docs: https://dashboard.gelato.com/docs/orders/v3/create/
 * (v4 endpoint shown in Gelato's own "Get started" guide adds multi-file
 * support per item, which apparel needs for front/back prints).
 *
 * Auth: X-API-KEY header with your API key from the Gelato dashboard
 * (Store settings -> API). Sandbox keys auto-cancel orders instead of
 * printing them, which is what you want while testing.
 */
export class GelatoProvider implements PodProvider {
  private readonly baseUrl = "https://order.gelatoapis.com/v4";

  constructor(private readonly apiKey: string) {}

  async createOrder(params: CreatePodOrderParams): Promise<CreatePodOrderResult> {
    const body = {
      orderType: "order",
      orderReferenceId: params.orderReferenceId,
      customerReferenceId: params.customerReferenceId,
      currency: params.currency,
      items: params.items.map((item) => ({
        itemReferenceId: item.itemReferenceId,
        productUid: item.productUid,
        files: [{ type: "default", url: item.artworkUrl }],
        quantity: item.quantity,
      })),
      // "standard" keeps costs down; switch to "express" per order if you
      // want to offer faster shipping at checkout.
      shipmentMethodUid: "standard",
      shippingAddress: {
        firstName: params.shippingAddress.firstName,
        lastName: params.shippingAddress.lastName,
        addressLine1: params.shippingAddress.addressLine1,
        addressLine2: params.shippingAddress.addressLine2 ?? "",
        city: params.shippingAddress.city,
        state: params.shippingAddress.state ?? "",
        postCode: params.shippingAddress.postCode,
        country: params.shippingAddress.country,
        email: params.shippingAddress.email,
        phone: params.shippingAddress.phone ?? "",
      },
    };

    const res = await fetch(`${this.baseUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json<Record<string, unknown>>();

    if (!res.ok) {
      throw new Error(
        `Gelato createOrder failed (${res.status}): ${JSON.stringify(json)}`
      );
    }

    return {
      providerOrderId: String(json.id),
      status: String(json.fulfillmentStatus ?? "created"),
      raw: json,
    };
  }

  async getOrderStatus(providerOrderId: string): Promise<PodOrderStatusResult> {
    const res = await fetch(`${this.baseUrl}/orders/${providerOrderId}`, {
      headers: { "X-API-KEY": this.apiKey },
    });

    const json = await res.json<Record<string, unknown>>();

    if (!res.ok) {
      throw new Error(
        `Gelato getOrderStatus failed (${res.status}): ${JSON.stringify(json)}`
      );
    }

    return {
      status: String(json.fulfillmentStatus ?? "unknown"),
      raw: json,
    };
  }
}

/**
 * Shape of Gelato's order webhook payload (configured in the Gelato
 * dashboard under Developers -> Webhooks). Verify this against your own
 * dashboard, Gelato's webhook payloads have changed shape between API
 * versions.
 */
export interface GelatoWebhookPayload {
  id: string;
  orderReferenceId: string;
  event: string; // e.g. "order_status_updated"
  fulfillmentStatus: string;
  [key: string]: unknown;
}
