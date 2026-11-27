import { Hono } from "hono";
import type { Env } from "../types";

export const ordersRoute = new Hono<{ Bindings: Env }>();

// GET /api/orders/:id — current order status (pending_payment -> paid ->
// submitted_to_pod -> shipped...). Meant to back the order confirmation
// page that Mercado Pago's back_urls point to (/pedido/:id), which isn't
// built yet (see "Known limitations" in README.md). Returns only
// non-personal fields (no customer name, email or address), since anyone
// holding the order id can call it.
ordersRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const order = await c.env.DB.prepare(
    "SELECT id, status, total_cents, tracking_url, created_at FROM orders WHERE id = ?"
  )
    .bind(id)
    .first();

  if (!order) {
    return c.json({ error: "order_not_found" }, 404);
  }

  return c.json({ order });
});
