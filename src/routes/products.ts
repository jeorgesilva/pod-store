import { Hono } from "hono";
import type { Env, Product } from "../types";

export const productsRoute = new Hono<{ Bindings: Env }>();

// GET /api/products — list active products for the storefront grid.
productsRoute.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC"
  ).all<Product>();

  return c.json({ products: results });
});

// GET /api/products/:id — a single active product. The current frontend
// doesn't call it (app.js works from the list above); it's kept as part
// of the public API.
productsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const product = await c.env.DB.prepare("SELECT * FROM products WHERE id = ? AND active = 1")
    .bind(id)
    .first<Product>();

  if (!product) {
    return c.json({ error: "product_not_found" }, 404);
  }

  return c.json({ product });
});
