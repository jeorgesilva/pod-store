export interface Env {
  DB: D1Database;
  ARTWORK: R2Bucket;
  ASSETS: Fetcher;

  // vars (wrangler.toml [vars])
  POD_PROVIDER: "gelato" | "montink";
  STORE_CURRENCY: string;
  PUBLIC_ARTWORK_BASE_URL: string;

  // secrets (set with `wrangler secret put NAME`, never in wrangler.toml)
  GELATO_API_KEY: string;
  MONTINK_API_KEY: string;
  MERCADOPAGO_ACCESS_TOKEN: string;
  MERCADOPAGO_WEBHOOK_SECRET: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  base_price_cents: number;
  pod_product_uid: string;
  mockup_image_url: string | null;
  print_area_json: string;
  product_type: "customizable" | "ready";
  default_artwork_url: string | null;
  print_width_mm: number | null;
  print_height_mm: number | null;
  active: number;
  created_at: string;
}

export interface CartItemInput {
  productId: string;
  quantity: number;
  /**
   * Data URL (data:image/png;base64,...) exported from the Fabric.js canvas.
   * Required for 'customizable' products; ignored for 'ready' products —
   * those always ship with the product's own default_artwork_url, never
   * whatever the client sends (same trust boundary as price).
   */
  artworkDataUrl?: string;
  /** Raw Fabric.js canvas.toJSON(), kept for reprints/support, optional */
  customization?: unknown;
}

export interface CheckoutRequestBody {
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  shippingAddress: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postCode: string;
    country: string; // ISO 2-letter, e.g. "BR"
  };
  items: CartItemInput[];
}

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "payment_failed"
  | "submitted_to_pod"
  | "in_production"
  | "shipped"
  | "delivered"
  | "cancelled";
