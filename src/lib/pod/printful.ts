import type { Env } from "../../types";
import type {
  CreatePodOrderParams,
  CreatePodOrderResult,
  PodOrderStatusResult,
  PodProvider,
} from "./types";

/**
 * Printful Orders API, v1 (stable — the "v2" API is still in beta as of
 * writing). Docs: https://developers.printful.com/docs/#tag/Orders-API
 *
 * Auth: `Authorization: Bearer <private token>` — a plain private token is
 * enough for a single-store integration like this one (no X-PF-Store-Id
 * header needed; that's only for account-level tokens spanning >1 store).
 *
 * Orders are created in 'draft' status by default and NOT sent to
 * production until confirmed — passing `confirm=true` on creation skips
 * the draft phase and submits immediately, which is what we want since
 * this is only called after Mercado Pago payment is already approved.
 */
export class PrintfulProvider implements PodProvider {
  private readonly baseUrl = "https://api.printful.com";

  constructor(private readonly apiKey: string) {}

  async createOrder(params: CreatePodOrderParams): Promise<CreatePodOrderResult> {
    const body = {
      external_id: params.orderReferenceId,
      shipping: "STANDARD",
      recipient: {
        name: `${params.shippingAddress.firstName} ${params.shippingAddress.lastName}`.trim(),
        address1: params.shippingAddress.addressLine1,
        address2: params.shippingAddress.addressLine2 || undefined,
        city: params.shippingAddress.city,
        state_code: params.shippingAddress.state || undefined,
        country_code: params.shippingAddress.country,
        zip: params.shippingAddress.postCode,
        email: params.shippingAddress.email,
        phone: params.shippingAddress.phone || undefined,
      },
      items: params.items.map((item) => {
        // Printful order items come in a few mutually exclusive shapes
        // (see "Creating orders from a template" in the Orders API docs).
        // Ours only ever uses two of them: a template id from the Embedded
        // Design Maker ('customizable' products), or a flat print file URL
        // ('ready' products, using their default_artwork_url).
        if (item.printfulTemplateId != null) {
          return {
            external_id: item.itemReferenceId,
            variant_id: Number(item.productUid),
            product_template_id: item.printfulTemplateId,
            quantity: item.quantity,
          };
        }
        if (!item.artworkUrl) {
          throw new Error(
            `printful createOrder: item ${item.itemReferenceId} has neither printfulTemplateId nor artworkUrl`
          );
        }
        return {
          external_id: item.itemReferenceId,
          variant_id: Number(item.productUid),
          quantity: item.quantity,
          files: [{ type: "default", url: item.artworkUrl }],
        };
      }),
    };

    const res = await fetch(`${this.baseUrl}/orders?confirm=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json<{
      code: number;
      result?: Record<string, unknown>;
      error?: { reason: string; message: string };
    }>();

    if (!res.ok || !json.result) {
      throw new Error(
        `Printful createOrder failed (${res.status}): ${json.error?.message ?? JSON.stringify(json)}`
      );
    }

    return {
      providerOrderId: String(json.result.id),
      status: String(json.result.status ?? "draft"),
      raw: json.result,
    };
  }

  async getOrderStatus(providerOrderId: string): Promise<PodOrderStatusResult> {
    const res = await fetch(`${this.baseUrl}/orders/${providerOrderId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const json = await res.json<{
      code: number;
      result?: Record<string, unknown>;
      error?: { reason: string; message: string };
    }>();

    if (!res.ok || !json.result) {
      throw new Error(
        `Printful getOrderStatus failed (${res.status}): ${json.error?.message ?? JSON.stringify(json)}`
      );
    }

    return {
      status: String(json.result.status ?? "unknown"),
      raw: json.result,
    };
  }
}

/**
 * Confirms a product_template_id sent by the client at checkout actually
 * exists in OUR Printful account before it's trusted in an order — same
 * "never trust the client" boundary as a 'ready' product's
 * default_artwork_url, just checked against Printful instead of our own D1.
 * A private token only ever sees templates that belong to its own store,
 * so a 404/error here means either a bogus id or one we don't own.
 * Docs: https://developers.printful.com/docs/#operation/getProductTemplateById
 */
export async function verifyPrintfulTemplate(
  env: Pick<Env, "PRINTFUL_API_KEY">,
  templateId: number
): Promise<boolean> {
  const res = await fetch(`https://api.printful.com/product-templates/${templateId}`, {
    headers: { Authorization: `Bearer ${env.PRINTFUL_API_KEY}` },
  });
  return res.ok;
}

/**
 * Shape of the events Printful POSTs to the configured webhook URL.
 * Docs: https://developers.printful.com/docs/#tag/Webhook-management-API
 *
 * `type` is one of (confirmed against the official docs, not guessed):
 *   order_created | order_updated | order_failed | order_canceled |
 *   package_shipped | package_returned | order_refunded |
 *   order_put_hold | order_put_hold_approval | order_remove_hold
 *
 * Order-status events (order_created/updated/failed/canceled) carry the
 * order under `data.order`; package_shipped carries both `data.shipment`
 * (tracking info) and `data.order`.
 */
export interface PrintfulWebhookPayload {
  type: string;
  created: number;
  retries: number;
  store: number;
  data: {
    reason?: string;
    order?: {
      id: number;
      external_id: string; // this is OUR order id, set at createOrder time
      status: string; // draft | inreview | pending | failed | canceled | onhold | inprocess | partial | fulfilled
      [key: string]: unknown;
    };
    shipment?: {
      id: number;
      tracking_number: string | number;
      tracking_url: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}
