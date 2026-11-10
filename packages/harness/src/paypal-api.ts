/** Minimal PayPal sandbox REST client used to confirm results. The harness trusts PayPal's API, not the store. */

const API = "https://api-m.sandbox.paypal.com";

export class PayPalApi {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await fetch(`${API}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`PayPal token request failed: ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return this.token.value;
  }

  async request<T = Record<string, unknown>>(method: string, pathname: string, body?: unknown): Promise<{ status: number; json: T }> {
    const res = await fetch(`${API}${pathname}`, {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: (text ? JSON.parse(text) : {}) as T };
  }

  getOrder(id: string) {
    return this.request<PayPalOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(id)}`);
  }

  getCapture(id: string) {
    return this.request<{ id: string; status: string; amount: Money }>("GET", `/v2/payments/captures/${encodeURIComponent(id)}`);
  }

  listWebhooks() {
    return this.request<{ webhooks: { id: string; url: string }[] }>("GET", "/v1/notifications/webhooks");
  }

  async createWebhook(url: string, eventTypes: string[]): Promise<string> {
    const { status, json } = await this.request<{ id?: string; message?: string }>("POST", "/v1/notifications/webhooks", {
      url,
      event_types: eventTypes.map((name) => ({ name })),
    });
    if (status !== 201 || !json.id) throw new Error(`Could not register PayPal webhook (${status}): ${JSON.stringify(json)}`);
    return json.id;
  }

  async deleteWebhook(id: string) {
    await this.request("DELETE", `/v1/notifications/webhooks/${encodeURIComponent(id)}`);
  }
}

export type Money = { currency_code: string; value: string };

export type PayPalOrder = {
  id: string;
  status: string;
  purchase_units: {
    custom_id?: string;
    amount: Money & { breakdown?: { item_total?: Money } };
    items?: { name: string; quantity: string; unit_amount: Money }[];
    payments?: { captures?: { id: string; status: string; amount: Money }[]; refunds?: { id: string; status: string }[] };
  }[];
};

export function valueToCents(value: string | undefined): number {
  if (!value) return Number.NaN;
  const [whole, frac = ""] = value.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Small, stable subset of a PayPal order for evidence. */
export function summarizeOrder(order: PayPalOrder) {
  const pu = order.purchase_units?.[0];
  return {
    id: order.id,
    status: order.status,
    amount: pu?.amount,
    customId: pu?.custom_id,
    items: pu?.items?.map((i) => ({ name: i.name, quantity: i.quantity, unitAmount: i.unit_amount })),
    captures: pu?.payments?.captures?.map((c) => ({ id: c.id, status: c.status, amount: c.amount })),
    refunds: pu?.payments?.refunds?.map((r) => ({ id: r.id, status: r.status })),
  };
}
