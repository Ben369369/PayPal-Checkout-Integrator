import path from "node:path";
import type { Browser, Page, Request } from "playwright";
import type Stripe from "stripe";
import {
  addToCart,
  approveInPopup,
  cartSubtotalText,
  openPayPalPopup,
  payWithPayPal,
  payWithStripe,
  RecordedContext,
  refundFromAdmin,
  successOrderId,
  type Buyer,
} from "./browser.js";
import { diffSnapshots, StoreDb, type OrderSnapshot } from "./db.js";
import { PayPalApi, summarizeOrder, valueToCents } from "./paypal-api.js";
import { replayToStore, type RelayedEvent, type WebhookSource } from "./relay.js";
import type { RunningStore } from "./store.js";

export type Check = { name: string; pass: boolean; detail?: string };

export type ScenarioResult = {
  id: number;
  name: string;
  provider: "paypal" | "stripe" | "both";
  status: "pass" | "fail" | "skipped";
  durationMs: number;
  checks: Check[];
  paypalOrderId?: string;
  storeOrderId?: string;
  apiEvidence?: Record<string, unknown>;
  dbSnapshot?: { paypal?: OrderSnapshot | null; stripe?: OrderSnapshot | null };
  parityDiff?: string[];
  videos?: string[];
  trace?: string;
  notes: string[];
  error?: string;
};

export type ScenarioContext = {
  browser: Browser;
  store: RunningStore;
  db: StoreDb;
  paypal: PayPalApi;
  stripe: Stripe;
  buyer: Buyer;
  relay: WebhookSource | null;
  runDir: string;
  prices: Record<string, number>;
  log: (msg: string) => void;
  /** Results other scenarios build on (refund and webhook scenarios reuse scenario 1's purchase). */
  shared: {
    s1?: { storeOrderId: string; paypalOrderId: string; captureId: string; stripeOrderId?: string };
  };
};

type Recorder = {
  check: (name: string, pass: boolean, detail?: unknown) => boolean;
  note: (msg: string) => void;
  result: ScenarioResult;
  context: (name: string, auth?: boolean) => Promise<{ page: Page; rc: RecordedContext }>;
};

type ScenarioDef = {
  id: number;
  name: string;
  provider: ScenarioResult["provider"];
  run: (ctx: ScenarioContext, r: Recorder) => Promise<void>;
};

const fmt = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

async function runScenario(def: ScenarioDef, ctx: ScenarioContext): Promise<ScenarioResult> {
  const started = Date.now();
  const result: ScenarioResult = {
    id: def.id,
    name: def.name,
    provider: def.provider,
    status: "pass",
    durationMs: 0,
    checks: [],
    notes: [],
  };
  const dir = path.join(ctx.runDir, `scenario-${def.id}`);
  const contexts: RecordedContext[] = [];
  const recorder: Recorder = {
    result,
    check(name, pass, detail) {
      result.checks.push({ name, pass, detail: detail === undefined ? undefined : fmt(detail) });
      ctx.log(`   ${pass ? "✓" : "✗"} ${name}${detail === undefined ? "" : ` (${fmt(detail)})`}`);
      return pass;
    },
    note(msg) {
      result.notes.push(msg);
      ctx.log(`   · ${msg}`);
    },
    async context(name, auth = false) {
      const rc = await RecordedContext.open(
        ctx.browser,
        path.join(dir, name),
        ctx.store.baseUrl,
        auth ? { username: "admin", password: ctx.store.adminPassword } : undefined,
      );
      contexts.push(rc);
      return { page: await rc.context.newPage(), rc };
    },
  };

  ctx.log(`▶ Scenario ${def.id}: ${def.name}`);
  try {
    await def.run(ctx, recorder);
  } catch (err) {
    result.error = (err as Error).message.split("\n").slice(0, 3).join(" ");
    ctx.log(`   ✗ error: ${result.error}`);
  }
  const videos: string[] = [];
  for (const rc of contexts) {
    const evidence = await rc.close().catch(() => null);
    if (evidence) {
      videos.push(...evidence.videos);
      result.trace ??= evidence.trace;
    }
  }
  result.videos = videos.map((v) => path.relative(ctx.runDir, v));
  if (result.trace) result.trace = path.relative(ctx.runDir, result.trace);
  if (result.status !== "skipped") {
    result.status = !result.error && result.checks.length > 0 && result.checks.every((c) => c.pass) ? "pass" : "fail";
  }
  result.durationMs = Date.now() - started;
  ctx.log(`   → ${result.status.toUpperCase()} (${Math.round(result.durationMs / 1000)}s)`);
  return result;
}

/* ------------------------------------------------------------------ */
/* Shared steps                                                        */
/* ------------------------------------------------------------------ */

type CartLine = { slug: string; qty: number };

function expectedTotal(ctx: ScenarioContext, cart: CartLine[]): number {
  return cart.reduce((sum, l) => {
    const price = ctx.prices[l.slug];
    if (price === undefined) throw new Error(`Product ${l.slug} is not in the store's catalog`);
    return sum + price * l.qty;
  }, 0);
}

async function fillCart(page: Page, cart: CartLine[]) {
  for (const line of cart) await addToCart(page, line.slug, line.qty);
}

/** PayPal purchase + confirmation via PayPal's API and the store DB. */
async function paypalPurchase(ctx: ScenarioContext, r: Recorder, page: Page, cart: CartLine[]) {
  const expected = expectedTotal(ctx, cart);
  await fillCart(page, cart);
  const { paypalOrderId, attempts } = await payWithPayPal(page, ctx.buyer, { log: r.note });
  if (attempts > 1) r.note(`PayPal popup needed ${attempts} attempts`);
  r.result.paypalOrderId = paypalOrderId;

  const storeOrderId = await successOrderId(page);
  r.result.storeOrderId = storeOrderId;
  r.check("success page shows the order as paid", (await page.getByTestId("order-status").textContent())?.trim() === "paid");

  const { status, json: order } = await ctx.paypal.getOrder(paypalOrderId);
  const summary = summarizeOrder(order);
  r.result.apiEvidence = { ...r.result.apiEvidence, paypalOrder: summary };
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  r.check("PayPal API: order COMPLETED", status === 200 && order.status === "COMPLETED", order.status);
  r.check("PayPal API: capture COMPLETED", capture?.status === "COMPLETED", capture?.status);
  r.check("PayPal API: captured amount equals cart total", valueToCents(capture?.amount.value) === expected, {
    captured: capture?.amount.value,
    expectedCents: expected,
  });

  const snap = ctx.db.snapshot(storeOrderId);
  r.result.dbSnapshot = { ...r.result.dbSnapshot, paypal: snap };
  r.check("DB: order paid", snap?.order.status === "paid", snap?.order.status);
  r.check("DB: total equals cart total", snap?.order.totalCents === expected, snap?.order.totalCents);
  r.check("DB: linked to the PayPal order and capture", snap?.order.paypalOrderId === paypalOrderId && snap?.order.paypalCaptureId === capture?.id);
  return { paypalOrderId, storeOrderId, captureId: capture?.id ?? "", expected, order, snap };
}

/** Same cart through Stripe Checkout, confirmed via Stripe's API and the store DB. */
async function stripePurchase(ctx: ScenarioContext, r: Recorder, cart: CartLine[]) {
  const expected = expectedTotal(ctx, cart);
  const { page } = await r.context("stripe");
  await fillCart(page, cart);
  await payWithStripe(page);
  const orderId = await successOrderId(page);
  const snap = ctx.db.snapshot(orderId);
  r.result.dbSnapshot = { ...r.result.dbSnapshot, stripe: snap };
  r.check("Stripe: DB order paid", snap?.order.status === "paid", snap?.order.status);

  const piId = snap?.order.stripePaymentIntentId as string | undefined;
  const pi = piId ? await ctx.stripe.paymentIntents.retrieve(piId) : null;
  r.check("Stripe API: PaymentIntent succeeded for the cart total", pi?.status === "succeeded" && pi.amount_received === expected, {
    status: pi?.status,
    amount: pi?.amount_received,
  });
  return { orderId, snap, sessionId: snap?.order.stripeCheckoutSessionId as string | undefined };
}

function parity(r: Recorder, paypal: OrderSnapshot | null | undefined, stripe: OrderSnapshot | null | undefined) {
  if (!paypal || !stripe) return r.check("Stripe parity: both orders exist", false);
  const diffs = diffSnapshots(paypal, stripe);
  r.result.parityDiff = diffs;
  return r.check("Stripe parity: DB rows match (ignoring provider IDs and timestamps)", diffs.length === 0, diffs.length ? diffs : "no differences");
}

async function waitForWebhook(ctx: ScenarioContext, r: Recorder, label: string, match: (e: RelayedEvent) => boolean) {
  if (!ctx.relay) return null;
  r.note(`waiting up to 180s for PayPal to deliver ${label}`);
  const event = await ctx.relay.waitFor(match, 180_000);
  r.check(`PayPal delivered ${label} to the relay`, Boolean(event), event ? `event ${event.id}` : "not delivered within 180s");
  return event;
}

const webhookUrl = (ctx: ScenarioContext) => `${ctx.store.baseUrl}/api/webhooks/paypal`;

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 1,
    name: "Single item, PayPal",
    provider: "both",
    async run(ctx, r) {
      const cart = [{ slug: "canvas-tote", qty: 1 }];
      const { page } = await r.context("paypal");
      const p = await paypalPurchase(ctx, r, page, cart);
      ctx.shared.s1 = { storeOrderId: p.storeOrderId, paypalOrderId: p.paypalOrderId, captureId: p.captureId };
      const s = await stripePurchase(ctx, r, cart);
      ctx.shared.s1.stripeOrderId = s.orderId;
      parity(r, p.snap, s.snap);
    },
  },
  {
    id: 2,
    name: "Several items with quantities",
    provider: "both",
    async run(ctx, r) {
      const cart = [
        { slug: "enamel-pin", qty: 3 },
        { slug: "mug-set", qty: 2 },
        { slug: "wool-throw", qty: 1 },
      ];
      const { page } = await r.context("paypal");
      const p = await paypalPurchase(ctx, r, page, cart);

      const ppItems = (p.order.purchase_units?.[0]?.items ?? [])
        .map((i) => ({ name: i.name, quantity: Number(i.quantity), unitPriceCents: valueToCents(i.unit_amount.value) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const dbItems = (p.snap?.items ?? []).map((i) => ({ name: i.name, quantity: i.quantity, unitPriceCents: i.unitPriceCents }));
      r.check("PayPal line items match the DB order items", JSON.stringify(ppItems) === JSON.stringify(dbItems), { paypal: ppItems, db: dbItems });

      const s = await stripePurchase(ctx, r, cart);
      if (s.sessionId) {
        const li = await ctx.stripe.checkout.sessions.listLineItems(s.sessionId, { limit: 100 });
        const stripeItems = li.data
          .map((l) => ({ name: l.description ?? "", quantity: l.quantity ?? 0, unitPriceCents: l.price?.unit_amount ?? 0 }))
          .sort((a, b) => a.name.localeCompare(b.name));
        r.result.apiEvidence = { ...r.result.apiEvidence, stripeLineItems: stripeItems };
        r.check("Stripe line items match PayPal line items", JSON.stringify(stripeItems) === JSON.stringify(ppItems), { stripe: stripeItems });
      }
      parity(r, p.snap, s.snap);
    },
  },
  {
    id: 3,
    name: "Buyer cancels in the popup",
    provider: "paypal",
    async run(ctx, r) {
      const { page } = await r.context("paypal");
      await fillCart(page, [{ slug: "mug-set", qty: 1 }]);
      const before = await cartSubtotalText(page);
      const paidBefore = ctx.db.ordersWithStatus("paid");

      const { popup, paypalOrderId } = await openPayPalPopup(page);
      r.result.paypalOrderId = paypalOrderId;
      await popup.waitForLoadState("domcontentloaded");
      await popup.close();
      await page.waitForTimeout(4_000);

      const cancelledMsg = page.getByTestId("paypal-cancelled");
      if (await cancelledMsg.count()) r.check("store shows a cancelled message", await cancelledMsg.isVisible());
      r.check("buyer stays on the cart page", /\/cart(\?|$)/.test(page.url()), page.url());
      await page.reload();
      r.check("cart is intact", (await cartSubtotalText(page)) === before, { before, after: await cartSubtotalText(page) });
      r.check("DB: no new paid order", ctx.db.ordersWithStatus("paid") === paidBefore);
      const storeOrderId = ctx.db.orderIdByPayPalOrderId(paypalOrderId);
      const snap = storeOrderId ? ctx.db.snapshot(storeOrderId) : null;
      r.result.dbSnapshot = { paypal: snap };
      r.check("DB: the PayPal order's store order is not paid", !snap || snap.order.status !== "paid", snap?.order.status ?? "no order row");
      const { json } = await ctx.paypal.getOrder(paypalOrderId);
      r.result.apiEvidence = { paypalOrder: summarizeOrder(json) };
      r.check("PayPal API: order not completed", json.status !== "COMPLETED", json.status);
    },
  },
  {
    id: 4,
    name: "Payment declined (negative testing)",
    provider: "paypal",
    async run(ctx, r) {
      const { page } = await r.context("paypal");
      await fillCart(page, [{ slug: "enamel-pin", qty: 1 }]);
      const before = await cartSubtotalText(page);
      const mock = JSON.stringify({ mock_application_codes: "INSTRUMENT_DECLINED" });
      let injected = 0;
      await page.route(
        (url) => url.origin === new URL(ctx.store.baseUrl).origin && /capture/i.test(url.pathname),
        async (route, request) => {
          if (request.method() !== "POST") return route.continue();
          injected++;
          await route.continue({ headers: { ...request.headers(), "paypal-mock-response": mock } });
        },
      );
      r.note("capture request carries PayPal-Mock-Response: INSTRUMENT_DECLINED");
      const { paypalOrderId } = await payWithPayPal(page, ctx.buyer, { until: "error", log: r.note });
      r.result.paypalOrderId = paypalOrderId;

      r.check("mock header was sent on the capture call", injected > 0, `${injected} request(s)`);
      const alert = page.locator('[role="alert"]').first();
      r.check("store shows an error to the buyer", await alert.isVisible(), (await alert.textContent())?.trim());
      r.check("buyer stays on the cart page", /\/cart(\?|$)/.test(page.url()), page.url());
      r.check("cart is intact", (await cartSubtotalText(page)) === before);

      const storeOrderId = ctx.db.orderIdByPayPalOrderId(paypalOrderId);
      const snap = storeOrderId ? ctx.db.snapshot(storeOrderId) : null;
      r.result.storeOrderId = storeOrderId ?? undefined;
      r.result.dbSnapshot = { paypal: snap };
      r.check("DB: order not paid", !snap || snap.order.status !== "paid", snap?.order.status);
      const { json } = await ctx.paypal.getOrder(paypalOrderId);
      r.result.apiEvidence = { paypalOrder: summarizeOrder(json) };
      r.check("PayPal API: order not completed", json.status !== "COMPLETED", json.status);
    },
  },
  {
    id: 5,
    name: "Webhook delivered twice",
    provider: "paypal",
    async run(ctx, r) {
      if (!ctx.relay) {
        r.result.status = "skipped";
        r.note("skipped: no webhook relay (cloudflared not installed), so no real PayPal event to deliver");
        return;
      }
      const s1 = ctx.shared.s1;
      if (!s1?.captureId) throw new Error("needs scenario 1's PayPal capture");
      r.result.paypalOrderId = s1.paypalOrderId;
      r.result.storeOrderId = s1.storeOrderId;
      const event = await waitForWebhook(ctx, r, "PAYMENT.CAPTURE.COMPLETED", (e) => e.eventType === "PAYMENT.CAPTURE.COMPLETED" && e.resourceId === s1.captureId);
      if (!event) return;
      const before = ctx.db.snapshot(s1.storeOrderId);

      const first = await replayToStore(webhookUrl(ctx), event);
      const second = await replayToStore(webhookUrl(ctx), event);
      r.result.apiEvidence = { eventId: event.id, firstDelivery: first, secondDelivery: second };
      r.check("first delivery accepted (signature verified)", first.status >= 200 && first.status < 300, first);
      r.check("second delivery acknowledged", second.status >= 200 && second.status < 300, second);
      r.check("DB: event recorded exactly once", ctx.db.processedEventCount("paypal", event.id) === 1);
      const after = ctx.db.snapshot(s1.storeOrderId);
      r.result.dbSnapshot = { paypal: after };
      r.check("DB: order fulfilled once (status and paidAt unchanged)", after?.order.status === before?.order.status && after?.order.paidAt === before?.order.paidAt, {
        status: after?.order.status,
      });
    },
  },
  {
    id: 6,
    name: "Forged webhook",
    provider: "paypal",
    async run(ctx, r) {
      const s1 = ctx.shared.s1;
      const fakeId = `WH-FORGED-${Date.now()}`;
      const fabricated = JSON.stringify({
        id: fakeId,
        event_type: "PAYMENT.CAPTURE.REFUNDED",
        resource: { id: "FAKE", status: "COMPLETED", links: [{ rel: "up", href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${s1?.captureId ?? "X"}` }] },
      });
      const before = s1 ? ctx.db.snapshot(s1.storeOrderId) : null;

      const res = await fetch(webhookUrl(ctx), { method: "POST", headers: { "content-type": "application/json" }, body: fabricated });
      r.check("unsigned event rejected", res.status >= 400 && res.status < 500, res.status);
      r.check("DB: unsigned event not recorded", ctx.db.processedEventCount("paypal", fakeId) === 0);

      if (ctx.relay && s1) {
        const real = await waitForWebhook(ctx, r, "a real event to tamper with", (e) => e.eventType === "PAYMENT.CAPTURE.COMPLETED");
        if (real) {
          const tampered = real.rawBody.replace(/"value":"(\d+)\.(\d{2})"/, '"value":"0.01"').replace(real.id, fakeId);
          const out = await replayToStore(webhookUrl(ctx), real, tampered);
          r.result.apiEvidence = { tamperedDelivery: out };
          r.check("real PayPal signature on an altered body rejected", out.status >= 400 && out.status < 500, out);
        }
      } else {
        r.note("only the unsigned forgery was tested: no relay, so no real signature to replay");
      }
      const after = s1 ? ctx.db.snapshot(s1.storeOrderId) : null;
      r.check("DB: order unchanged", JSON.stringify(after?.order) === JSON.stringify(before?.order), after?.order.status);
    },
  },
  {
    id: 7,
    name: "Tampered price from the browser",
    provider: "paypal",
    async run(ctx, r) {
      const cart = [{ slug: "wool-throw", qty: 1 }];
      const expected = expectedTotal(ctx, cart);
      const { page } = await r.context("paypal");
      // paypalPurchase() fills the cart; the route below only rewrites PayPal requests.

      const origin = new URL(ctx.store.baseUrl).origin;
      const tamperFields = { amount: "0.01", value: "0.01", total: "0.01", totalCents: 1, priceCents: 1, unitPriceCents: 1, currency: "USD" };
      let createOrderUrl: string | null = null;
      await page.route(
        (url) => url.origin === origin && /paypal/i.test(url.pathname) && !/capture|token/i.test(url.pathname),
        async (route, request: Request) => {
          if (request.method() !== "POST") return route.continue();
          createOrderUrl ??= request.url();
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(request.postData() ?? "{}");
          } catch {
            /* not JSON */
          }
          await route.continue({
            postData: JSON.stringify({ ...body, ...tamperFields, items: [{ name: "x", unit_amount: { value: "0.01" }, quantity: 1 }] }),
            headers: { ...request.headers(), "content-type": "application/json" },
          });
        },
      );
      r.note("create-order request body rewritten with amount 0.01");
      const p = await paypalPurchase(ctx, r, page, cart);
      r.check("tampered request was sent", Boolean(createOrderUrl), createOrderUrl ?? "no PayPal create-order request seen");
      r.check("PayPal order amount is the real total", valueToCents(p.order.purchase_units?.[0]?.amount.value) === expected, p.order.purchase_units?.[0]?.amount.value);
    },
  },
  {
    id: 8,
    name: "Refund",
    provider: "both",
    async run(ctx, r) {
      const s1 = ctx.shared.s1;
      if (!s1) throw new Error("needs scenario 1's orders");
      r.result.paypalOrderId = s1.paypalOrderId;
      r.result.storeOrderId = s1.storeOrderId;
      const { page } = await r.context("admin", true);

      await refundFromAdmin(page, s1.storeOrderId);
      const paypalSnap = ctx.db.snapshot(s1.storeOrderId);
      r.check("DB: PayPal order refunded", paypalSnap?.order.status === "refunded" && Boolean(paypalSnap.order.refundedAt), paypalSnap?.order.status);
      const { json: capture } = await ctx.paypal.getCapture(s1.captureId);
      r.result.apiEvidence = { paypalCapture: { id: capture.id, status: capture.status, amount: capture.amount } };
      r.check("PayPal API: capture REFUNDED", capture.status === "REFUNDED", capture.status);

      const event = await waitForWebhook(ctx, r, "PAYMENT.CAPTURE.REFUNDED", (e) => {
        if (e.eventType !== "PAYMENT.CAPTURE.REFUNDED") return false;
        return e.rawBody.includes(`/captures/${s1.captureId}`);
      });
      if (event) {
        const out = await replayToStore(webhookUrl(ctx), event);
        r.check("refund webhook accepted", out.status >= 200 && out.status < 300, out);
        r.check("DB: still refunded after the webhook", ctx.db.snapshot(s1.storeOrderId)?.order.status === "refunded");
      } else if (!ctx.relay) {
        r.note("refund webhook not tested: no relay");
      }

      let stripeSnap: OrderSnapshot | null = null;
      if (s1.stripeOrderId) {
        await refundFromAdmin(page, s1.stripeOrderId);
        stripeSnap = ctx.db.snapshot(s1.stripeOrderId);
        r.check("Stripe: DB order refunded", stripeSnap?.order.status === "refunded");
        const pi = stripeSnap?.order.stripePaymentIntentId as string;
        const refunds = await ctx.stripe.refunds.list({ payment_intent: pi });
        r.check("Stripe API: one full refund", refunds.data.length === 1 && refunds.data[0].amount === stripeSnap?.order.totalCents);
      }
      r.result.dbSnapshot = { paypal: ctx.db.snapshot(s1.storeOrderId), stripe: stripeSnap };
      parity(r, ctx.db.snapshot(s1.storeOrderId), stripeSnap);
    },
  },
  {
    id: 9,
    name: "Stripe still works",
    provider: "stripe",
    async run(ctx, r) {
      const cart = [
        { slug: "canvas-tote", qty: 2 },
        { slug: "enamel-pin", qty: 1 },
      ];
      const s = await stripePurchase(ctx, r, cart);
      r.result.storeOrderId = s.orderId;
      r.check("DB: Stripe order total equals cart total", s.snap?.order.totalCents === expectedTotal(ctx, cart));
      r.check("DB: Stripe order not marked as PayPal", s.snap?.order.paymentProvider !== "paypal" && !s.snap?.order.paypalOrderId);
    },
  },
];

/** Execution order: purchases first, webhook checks last so PayPal has time to deliver. */
export const RUN_ORDER = [1, 2, 3, 4, 7, 9, 5, 6, 8];

export async function runScenarios(ctx: ScenarioContext, only?: number[]): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const id of RUN_ORDER) {
    if (only && !only.includes(id)) continue;
    const def = SCENARIOS.find((s) => s.id === id)!;
    results.push(await runScenario(def, ctx));
  }
  return results.sort((a, b) => a.id - b.id);
}
