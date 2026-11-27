/**
 * LEGACY: kept for historical reference only, not part of the active flow.
 *
 * An early draft adapter for Montink (a Brazilian print-on-demand
 * provider) that was never used or verified against Montink's real API
 * (see "READ ME FIRST" below). The active adapter is ../printful.ts
 * (POD_PROVIDER = "printful" in wrangler.toml).
 */
import type {
  CreatePodOrderParams,
  CreatePodOrderResult,
  PodOrderStatusResult,
  PodProvider,
} from "../types";

/**
 * ============================== READ ME FIRST ==============================
 * Unlike Gelato, Montink doesn't publish a full public API reference — you
 * get the real docs (endpoints, auth header name, exact payload shape) from
 * their team after you sign up for the "Integra" plan and request API
 * access. Everything below is a reasonable best-guess scaffold based on
 * their publicly described capabilities ("listar produtos, calcular frete,
 * criar pedidos e acompanhar o status"), NOT a verified contract.
 *
 * Before using this in production:
 *   1. Get the real API docs from Montink support once you have a login.
 *   2. Fix `baseUrl`, the auth header/scheme, and the request/response
 *      field names below to match.
 *   3. Because this implements the same PodProvider interface as Gelato,
 *      nothing else in the app (checkout.ts, webhooks.ts) needs to change
 *      once you do.
 * =============================================================================
 */
export class MontinkProvider implements PodProvider {
  // TODO: confirm the real base URL from Montink's docs.
  private readonly baseUrl = "https://api.montink.com/v1";

  constructor(private readonly apiKey: string) {}

  async createOrder(params: CreatePodOrderParams): Promise<CreatePodOrderResult> {
    // TODO: confirm field names below against Montink's real payload.
    const body = {
      referencia_pedido: params.orderReferenceId,
      referencia_cliente: params.customerReferenceId,
      moeda: params.currency,
      itens: params.items.map((item) => ({
        referencia_item: item.itemReferenceId,
        produto_id: item.productUid,
        arte_url: item.artworkUrl,
        quantidade: item.quantity,
      })),
      endereco_entrega: {
        nome: params.shippingAddress.firstName,
        sobrenome: params.shippingAddress.lastName,
        endereco1: params.shippingAddress.addressLine1,
        endereco2: params.shippingAddress.addressLine2 ?? "",
        cidade: params.shippingAddress.city,
        estado: params.shippingAddress.state ?? "",
        cep: params.shippingAddress.postCode,
        pais: params.shippingAddress.country,
        email: params.shippingAddress.email,
        telefone: params.shippingAddress.phone ?? "",
      },
    };

    const res = await fetch(`${this.baseUrl}/pedidos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // TODO: confirm auth scheme — could be `Authorization: Bearer`,
        // a custom header like Gelato's X-API-KEY, or a query param.
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json<Record<string, unknown>>();

    if (!res.ok) {
      throw new Error(
        `Montink createOrder failed (${res.status}): ${JSON.stringify(json)}`
      );
    }

    return {
      // TODO: adjust to whatever id field the real response actually uses.
      providerOrderId: String(json.id ?? json.pedido_id),
      status: String(json.status ?? "created"),
      raw: json,
    };
  }

  async getOrderStatus(providerOrderId: string): Promise<PodOrderStatusResult> {
    const res = await fetch(`${this.baseUrl}/pedidos/${providerOrderId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const json = await res.json<Record<string, unknown>>();

    if (!res.ok) {
      throw new Error(
        `Montink getOrderStatus failed (${res.status}): ${JSON.stringify(json)}`
      );
    }

    return {
      status: String(json.status ?? "unknown"),
      trackingUrl: typeof json.url_rastreio === "string" ? json.url_rastreio : undefined,
      raw: json,
    };
  }
}
