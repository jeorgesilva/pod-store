export interface Env {
  DB: D1Database;
  ARTWORK: R2Bucket;
  ASSETS: Fetcher;

  // vars (wrangler.toml [vars])
  POD_PROVIDER: "printful" | "gelato" | "montink";
  STORE_CURRENCY: string;
  PUBLIC_ARTWORK_BASE_URL: string;

  // secrets (set with `wrangler secret put NAME`, never in wrangler.toml)
  PRINTFUL_API_KEY: string;
  /** Private token with the "Embedded Designer" extension — separate from
   *  PRINTFUL_API_KEY, used only to mint EDM nonces. See README.md. */
  PRINTFUL_EDM_TOKEN: string;
  // Legacy: only read by the Gelato/Montink adapters in
  // src/lib/pod/_legacy/, kept so they keep compiling.
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
   * Legacy — the Fabric.js customizer is no longer wired into the main
   * flow (see public/customizer.js), kept only so it still typechecks if
   * ever re-enabled. Ignored by checkout.ts.
   */
  artworkDataUrl?: string;
  /**
   * Printful Embedded Design Maker template id, returned by the
   * onTemplateSaved callback once the customer finishes designing.
   * Required for 'customizable' products; ignored for 'ready' products —
   * those always ship with the product's own default_artwork_url, never
   * whatever the client sends (same trust boundary as price). Verified
   * server-side against Printful before use — see checkout.ts.
   */
  printfulTemplateId?: number;
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
