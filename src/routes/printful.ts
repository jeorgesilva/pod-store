import { Hono } from "hono";
import type { Env, Product } from "../types";

export const printfulRoute = new Hono<{ Bindings: Env }>();

// POST /api/printful/edm-nonce
// Body: { productId: string } — one of OUR product ids (products.id).
// Mints a short-lived nonce that authorizes the customer's browser to open
// the Printful Embedded Design Maker iframe for this product, without ever
// exposing PRINTFUL_EDM_TOKEN to the client. Must be called from the
// back-end per Printful's docs: https://developers.printful.com/docs/edm/
printfulRoute.post("/edm-nonce", async (c) => {
  const body = await c.req.json<{ productId?: string }>();
  if (!body.productId) {
    return c.json({ error: "missing_product_id" }, 400);
  }

  const product = await c.env.DB.prepare(
    "SELECT * FROM products WHERE id = ? AND active = 1 AND product_type = 'customizable'"
  )
    .bind(body.productId)
    .first<Product>();

  if (!product) {
    return c.json({ error: "product_not_found" }, 404);
  }

  // products.pod_product_uid holds the Printful catalog *variant* id, but
  // the design maker's initProduct needs the parent catalog *product* id —
  // resolve one from the other via the (public, no-auth-needed) Catalog API.
  // Docs: https://developers.printful.com/docs/#operation/getVariantById
  const variantRes = await fetch(
    `https://api.printful.com/products/variant/${product.pod_product_uid}`
  );
  const variantJson = await variantRes.json<{
    result?: { variant?: { product_id?: number } };
  }>();
  const catalogProductId = variantJson.result?.variant?.product_id;

  if (!variantRes.ok || !catalogProductId) {
    return c.json({ error: "printful_variant_lookup_failed" }, 502);
  }

  // Unique per design session, not per product — reusing an id would edit
  // an existing template instead of starting a new one. See "Generate and
  // manage this id on your own website" in the EDM docs.
  const externalProductId = `${product.id}-${crypto.randomUUID()}`;

  const nonceRes = await fetch("https://api.printful.com/embedded-designer/nonces", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${c.env.PRINTFUL_EDM_TOKEN}`,
    },
    body: JSON.stringify({ external_product_id: externalProductId }),
  });
  const nonceJson = await nonceRes.json<{
    result?: { nonce?: string; expires_at?: number };
    error?: { message: string };
  }>();

  if (!nonceRes.ok || !nonceJson.result?.nonce) {
    return c.json(
      { error: "printful_nonce_failed", detail: nonceJson.error?.message },
      502
    );
  }

  return c.json({
    nonce: nonceJson.result.nonce,
    externalProductId,
    printfulCatalogProductId: catalogProductId,
  });
});
