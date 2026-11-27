/**
 * Provider-agnostic contract for submitting print-on-demand orders, so the
 * order-submission code (submitOrderToPod in routes/webhooks.ts) doesn't
 * depend on any one provider's API. ./index.ts picks the adapter from
 * POD_PROVIDER in wrangler.toml: Printful (./printful.ts) is the active
 * one, and the Gelato and Montink adapters in ./_legacy/ implement the
 * same interface. The Embedded Design Maker pieces (nonce route, template
 * verification, webhook payload) are Printful-specific by nature and live
 * outside this interface.
 */

export interface PodOrderItem {
  /** Your own id for this line item (order_items.id works well) */
  itemReferenceId: string;
  /** The provider's product identifier (products.pod_product_uid) */
  productUid: string;
  /**
   * Public URL of the finished, print-ready artwork. Used for
   * 'ready' products (products.default_artwork_url). Mutually exclusive
   * with printfulTemplateId — a given item has exactly one of the two.
   */
  artworkUrl?: string;
  /**
   * Printful Embedded Design Maker template id (order_items.pod_template_id),
   * for 'customizable' products designed in the EDM iframe instead of
   * uploaded as a flat file. Printful-specific — other providers ignore it.
   */
  printfulTemplateId?: number;
  quantity: number;
}

export interface PodShippingAddress {
  firstName: string;
  lastName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postCode: string;
  country: string; // ISO 3166-1 alpha-2, e.g. "BR"
  email: string;
  phone?: string;
}

export interface CreatePodOrderParams {
  orderReferenceId: string; // your own orders.id
  customerReferenceId: string;
  currency: string;
  items: PodOrderItem[];
  shippingAddress: PodShippingAddress;
}

export interface CreatePodOrderResult {
  /** The provider's own order id, stored in orders.pod_order_id */
  providerOrderId: string;
  /** Provider's own status string at creation time, for logging */
  status: string;
  /** Full raw response, kept for debugging */
  raw: unknown;
}

export interface PodOrderStatusResult {
  status: string;
  trackingUrl?: string;
  raw: unknown;
}

export interface PodProvider {
  createOrder(params: CreatePodOrderParams): Promise<CreatePodOrderResult>;
  getOrderStatus(providerOrderId: string): Promise<PodOrderStatusResult>;
}
