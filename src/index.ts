import { Hono } from "hono";
import { checkoutRoute } from "./routes/checkout";
import { ordersRoute } from "./routes/orders";
import { productsRoute } from "./routes/products";
import { webhooksRoute } from "./routes/webhooks";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/products", productsRoute);
app.route("/api/checkout", checkoutRoute);
app.route("/api/orders", ordersRoute);
app.route("/api/webhooks", webhooksRoute);

// Anything that isn't /api/* falls through to the static files in /public
// (the [assets] binding in wrangler.toml). This is what makes one Worker
// serve both the storefront and its own API.
app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
