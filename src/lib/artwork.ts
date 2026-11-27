/**
 * LEGACY: nothing imports this today; kept in case a file-upload flow
 * comes back.
 *
 * It belonged to the Fabric.js designer flow (public/customizer.js), where
 * the browser exported a PNG that had to be stored in R2 for the POD
 * provider to download. Neither product type uploads artwork now:
 * 'customizable' products use a Printful Embedded Design Maker template
 * id, and 'ready' products use the fixed default_artwork_url from D1. The
 * same goes for the ARTWORK R2 binding and PUBLIC_ARTWORK_BASE_URL in
 * wrangler.toml: nothing else reads them, so they sit idle.
 */
import type { Env } from "../types";

/**
 * Decodes a data URL (data:image/png;base64,....) exported from the
 * Fabric.js canvas, stores it in R2, and returns a public URL that the
 * POD provider's API can fetch from (Gelato/Montink both need a URL they
 * can download the print file from — they never accept raw bytes).
 *
 * Requires the R2 bucket to have public access enabled (or be fronted by
 * a custom domain) — set PUBLIC_ARTWORK_BASE_URL in wrangler.toml to match.
 * See: https://developers.cloudflare.com/r2/buckets/public-buckets/
 */
export async function saveArtworkToR2(
  env: Env,
  orderId: string,
  itemId: string,
  dataUrl: string
): Promise<string> {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) {
    throw new Error("artworkDataUrl must be a base64 data URL, e.g. data:image/png;base64,...");
  }
  const [, contentType, base64] = match;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const extension = contentType.split("/")[1] ?? "png";
  const key = `orders/${orderId}/${itemId}.${extension}`;

  await env.ARTWORK.put(key, bytes, {
    httpMetadata: { contentType },
  });

  return `${env.PUBLIC_ARTWORK_BASE_URL.replace(/\/$/, "")}/${key}`;
}
