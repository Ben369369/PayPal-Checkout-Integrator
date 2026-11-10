/**
 * Client for APIMatic's Context Plugin for the PayPal Server SDK (TypeScript):
 * a public streamable-HTTP MCP server that answers questions about the exact
 * SDK surface (endpoints, models, integration steps). Every query is logged
 * so the run report can show what the agent looked up.
 */

export const APIMATIC_PAYPAL_TS_URL =
  "https://chatbotapi.apimatic.io/mcp/cacdb56c-c789-4017-b820-011496c7ed24/typescript";

export type ContextQuery = { tool: string; args: Record<string, unknown>; at: string; ok: boolean; chars: number };

export class ApimaticContext {
  readonly queries: ContextQuery[] = [];
  private sessionId: string | null = null;
  private nextId = 1;

  constructor(private readonly url = APIMATIC_PAYPAL_TS_URL) {}

  private async rpc(method: string, params?: unknown, notification = false): Promise<unknown> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "X-Apimatic-Mcp-Client": "PayPalCheckoutIntegrator",
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      },
      body: JSON.stringify(notification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: this.nextId++, method, params }),
      signal: AbortSignal.timeout(120_000),
    });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    if (notification) return null;
    if (!res.ok) throw new Error(`APIMatic MCP ${method} failed: HTTP ${res.status}`);
    const text = await res.text();
    // Streamable HTTP answers either with JSON or with SSE "data:" lines.
    const payload = text.trim().startsWith("{")
      ? text
      : text
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .find((l) => l.startsWith("{")) ?? "{}";
    const json = JSON.parse(payload) as { result?: unknown; error?: { message: string } };
    if (json.error) throw new Error(`APIMatic MCP ${method}: ${json.error.message}`);
    return json.result;
  }

  private async ensureSession() {
    if (this.sessionId) return;
    await this.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "paypal-checkout-integrator-agent", version: "0.1.0" },
    });
    await this.rpc("notifications/initialized", undefined, true);
  }

  /** Calls one of the plugin's tools and returns its text content. */
  async call(tool: "endpoint_search" | "model_search" | "ask", args: Record<string, unknown>): Promise<string> {
    const entry: ContextQuery = { tool, args, at: new Date().toISOString(), ok: false, chars: 0 };
    this.queries.push(entry);
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.ensureSession();
        const result = (await this.rpc("tools/call", { name: tool, arguments: args })) as {
          content?: { type: string; text?: string }[];
          isError?: boolean;
        };
        const text = (result.content ?? [])
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("\n");
        entry.ok = !result.isError;
        entry.chars = text.length;
        return text || "(no content)";
      } catch (err) {
        this.sessionId = null; // session may have expired; re-initialize once
        if (attempt === 2) return `APIMatic Context Plugin error: ${(err as Error).message}`;
      }
    }
    return "unreachable";
  }
}
