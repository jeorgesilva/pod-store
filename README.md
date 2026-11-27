> **Context note:** this project demonstrates hands-on experience with
> Cloudflare Workers, the D1 database, webhook integrations and
> production-ready checkout logic — skills that apply directly to building
> tracking infrastructure and data automation.

# pod-store

A print-on-demand storefront that runs as a single Cloudflare Worker:
product catalog, an embedded product designer (Printful Embedded Design
Maker), checkout with Mercado Pago, and automatic creation of the
production order at Printful once the payment is confirmed.

**Stack:** Cloudflare Workers · Hono · D1 (SQLite) · TypeScript · vanilla JS
frontend (no build step) · Printful API · Mercado Pago API

## Architecture

```
Browser  (public/: index.html + app.js — vanilla JS, no build step)
   │
   ▼
Cloudflare Worker  (one deploy serves both the storefront and the API)
   ├── Static assets (public/) .............. HTML, CSS, JS, product photos
   └── Hono router (src/index.ts) → /api/*
       ├── GET  /api/products ............... D1
       ├── POST /api/printful/edm-nonce ..... D1 → Printful (EDM nonce)
       ├── POST /api/checkout ............... D1 (prices)
       │                                      → Printful (verify design)
       │                                      → D1 (save order)
       │                                      → Mercado Pago (payment link)
       ├── GET  /api/orders/:id ............. D1
       ├── POST /api/webhooks/mercadopago ◄── Mercado Pago (payment status)
       │     verify signature → D1 'paid' → Printful (create production order)
       └── POST /api/webhooks/pod ◄────────── Printful (order/shipping status)
             map status → D1 (status, tracking URL)

Storage: D1 (products, orders, order_items) · R2 bucket bound but unused today
```

**Order lifecycle** (`orders.status`): `pending_payment → paid →
submitted_to_pod → in_production → shipped`, or `payment_failed` /
`cancelled`.

**How the webhooks find the order:** our own `orders.id` is sent to Mercado
Pago as `external_reference` and to Printful as `external_id`. Both
webhooks carry it back, so no mapping table is needed.

### Key files

| File | What it does |
|---|---|
| [src/index.ts](src/index.ts) | Mounts the API routes; anything else falls through to the static assets |
| [src/routes/checkout.ts](src/routes/checkout.ts) | Server-side pricing, design verification, order creation, payment link |
| [src/routes/webhooks.ts](src/routes/webhooks.ts) | Mercado Pago payment webhook and Printful status webhook |
| [src/lib/mercadopago.ts](src/lib/mercadopago.ts) | Checkout Pro preference and webhook signature (HMAC-SHA256) verification |
| [src/routes/printful.ts](src/routes/printful.ts) | Mints the designer nonce server-side, so the Printful token never reaches the browser |
| [src/lib/pod/printful.ts](src/lib/pod/printful.ts) | Printful Orders API adapter behind a provider-agnostic interface |
| [src/db/schema.sql](src/db/schema.sql) | D1 schema: `products`, `orders`, `order_items` |

## What works

- **Catalog:** `GET /api/products` and `GET /api/products/:id`, read from D1.
- **Product designer:** the Printful Embedded Design Maker (EDM), in an
  iframe. `POST /api/printful/edm-nonce` mints a short-lived nonce on the
  backend, so the Printful token never reaches the browser. The customer
  uploads images, adds text and picks variants (color/size) inside
  Printful's editor. On save, Printful returns a `templateId`, and that
  reference, not a file exported in the browser, is what goes into the
  order.
- **`POST /api/checkout`:**
  - recomputes the total from the prices stored in D1 (never trusts a
    price sent by the browser);
  - verifies that each `templateId` belongs to our Printful account (never
    trusts a design reference sent by the browser);
  - saves the order in D1, creates a Mercado Pago Checkout Pro preference
    and returns the payment URL.
- **`POST /api/webhooks/mercadopago`:** verifies the request signature,
  fetches the payment from Mercado Pago, marks the order as paid and
  creates the production order at Printful.
- **`POST /api/webhooks/pod`:** receives Printful status events
  (`order_created`, `order_updated`, `order_failed`, `order_canceled`,
  `package_shipped`) and updates the order in D1, including the tracking
  URL.
- **Provider-agnostic POD interface** ([src/lib/pod/types.ts](src/lib/pod/types.ts)),
  with Printful as the active adapter, implemented against the official
  Orders API (v1) and Embedded Design Maker docs.

**Tested so far:** `npm run typecheck`, plus the catalog, product routes and
static files under local `wrangler dev` (before the Printful migration).
The calls to the live Printful and Mercado Pago APIs have not been
exercised yet: they need real credentials and manual dashboard setup (see
[Before going live](#before-going-live)).

## Known limitations

- **No order confirmation page yet.** Mercado Pago's `back_urls` send the
  customer to `/pedido/:id`, which has no route or page, so the customer
  lands on a 404 after paying. `GET /api/orders/:id` already exists to back
  that page.
- **An order can get stuck at `paid`.** The payment webhook sets the order
  to `paid` *before* calling Printful. If that call fails, Mercado Pago
  retries the webhook, but the retry is skipped because the order is no
  longer `pending_payment`, so it never reaches Printful. Needs a retry or
  reconciliation step.
- **The Printful webhook doesn't authenticate its sender.** Anyone who
  knows the URL could change an order's status. Possible fixes: a secret
  token in the registered webhook URL, or re-fetching the order from the
  Printful API before applying the update.
- **`delivered` is never reached automatically.** Printful sends
  `package_shipped` (with tracking) but no delivery confirmation, so orders
  stay at `shipped`.
- **The cart lives in memory**, so it's lost on page reload.

## Deliberate simplifications

- **Mercado Pago Checkout Pro** (redirects to Mercado Pago) rather than
  Checkout Transparente (fully embedded). It's the simplest and safest way
  to start; [src/lib/mercadopago.ts](src/lib/mercadopago.ts) can be migrated
  later.
- **No admin panel or authentication.** Products are added directly in D1
  (see [src/db/seed.sql](src/db/seed.sql)).
- **Sample catalog:** 8 real Printful products, with real variant ids and
  product photos. Retail prices are derived from Printful's USD cost at the
  2026-07-08 exchange rate (1 USD ≈ 5.16 BRL), so they need recalculating
  if the rate moves. All of them are `customizable`: the `ready`
  (fixed-artwork) product path exists in the code, but no product in the
  seed uses it.
- **Generic visual design:** swap the colors in `public/style.css`
  (`:root`) for a real brand identity.

### Legacy code kept for reference

Not part of the active flow. Each file opens with a `LEGACY` note explaining
why it's still there:

- [src/lib/pod/_legacy/](src/lib/pod/_legacy/): the Gelato adapter
  (previous provider) and an unused Montink draft, both behind the same
  `PodProvider` interface.
- `public/customizer.js`: the earlier Fabric.js designer, replaced by
  Printful's EDM and no longer loaded by `index.html`.
- `src/lib/artwork.ts`: the R2 upload helper from the Fabric.js flow.
  Nothing calls it today, so the R2 bucket binding is idle.

## Run locally

```bash
npm install

# Create the D1 database (once) and copy its database_id into wrangler.toml
npx wrangler d1 create pod-store-db

npm run db:migrate:local
npm run db:seed:local

cp .dev.vars.example .dev.vars   # fill in test/sandbox credentials
npm run dev
```

Open `http://localhost:8787`. An `Unable to fetch the Request.cf object`
warning in the console is expected and harmless.

There's no migration system: `schema.sql` is idempotent (`CREATE TABLE IF
NOT EXISTS`), so a column change won't reach an existing local database.
Reset it with `rm -rf .wrangler/state` and re-run the two `db:` commands.

## Printful setup

**Tokens.** Printful recommends separate private tokens: one for the Orders
API (`PRINTFUL_API_KEY`) and, for the Embedded Design Maker
(`PRINTFUL_EDM_TOKEN`), one token flagged "development purposes only" for
local use plus a separate production token. This keeps the development
token away from real orders.

**Domain allowlist (manual, dashboard only).** On every token with the
Embedded Design Maker extension, fill in **"Domains"** with the origins
allowed to open the iframe: for example `localhost:8787` locally and the
real domain in production. Without it, Printful ignores the iframe's
messages.

**Webhook registration.** API-only ("manual order") Printful stores have no
webhook screen in the dashboard, so the webhook is registered once via the
API, after the first deploy:

```bash
curl -X POST https://api.printful.com/webhooks \
  -H "Authorization: Bearer $PRINTFUL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://YOUR-DOMAIN/api/webhooks/pod",
    "types": ["order_created", "order_updated", "order_failed", "order_canceled", "package_shipped"]
  }'
```

Only one webhook URL is active at a time; calling this again replaces it.

## Configuration and secrets

| Name | Where | What it is |
|---|---|---|
| `POD_PROVIDER` | `wrangler.toml` `[vars]` | `"printful"` (`"gelato"`/`"montink"` exist only for the legacy adapters) |
| `PRINTFUL_API_KEY` | secret | Orders API token (see [Printful setup](#printful-setup)) |
| `PRINTFUL_EDM_TOKEN` | secret | Embedded Design Maker token, different per environment (dev vs production) |
| `MERCADOPAGO_ACCESS_TOKEN` | secret | Mercado Pago dashboard → credentials (start with the `TEST-...` ones) |
| `MERCADOPAGO_WEBHOOK_SECRET` | secret | Mercado Pago dashboard → Webhooks → secret key |

Secrets live in `.dev.vars` locally (git-ignored) and are set with
`wrangler secret put NAME` in production. They never go in `wrangler.toml`
or in the source code.

## Deploy

```bash
npm run db:migrate:remote
npm run deploy
```

Then, on each provider's side:

- **Mercado Pago:** no webhook URL to set by hand, because the
  `notification_url` is sent with every preference (see
  [src/routes/checkout.ts](src/routes/checkout.ts)). The signing secret
  comes from the dashboard (see the table above).
- **Printful:** register the webhook and add the production domain to the
  EDM token's allowlist (see [Printful setup](#printful-setup)).

## Before going live

- Create the development and production EDM tokens and fill in the domain
  allowlist.
- Register the Printful webhook after the first deploy.
- Fix the [known limitations](#known-limitations), at least the
  confirmation page and the stuck-at-`paid` case.
- Run a full end-to-end purchase with a low-value order.
- Sort out company registration (CNPJ/MEI) and invoicing (nota fiscal).
  That's account setup, outside the code.
- Recheck the catalog prices if the USD/BRL rate has moved significantly
  since 2026-07-08.
