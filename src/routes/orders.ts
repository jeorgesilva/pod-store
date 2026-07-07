import { Hono } from "hono";
import type { Env } from "../types";

export const ordersRoute = new Hono<{ Bindings: Env }>();

// GET /api/orders/:id — used by the order confirmation page to show
// current status (pending_payment -> paid -> submitted_to_pod -> shipped...).
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
