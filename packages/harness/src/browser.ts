import { mkdirSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";

export type Buyer = { email: string; password: string };

/** A recorded browser context: video for every page, plus a Playwright trace. */
export class RecordedContext {
  private constructor(
    readonly context: BrowserContext,
    private readonly dir: string,
  ) {}

  static async open(browser: Browser, dir: string, baseURL: string, httpCredentials?: { username: string; password: string }) {
    mkdirSync(dir, { recursive: true });
    const context = await browser.newContext({
      baseURL,
      httpCredentials,
      recordVideo: { dir, size: { width: 1280, height: 800 } },
      viewport: { width: 1280, height: 800 },
    });
    await context.tracing.start({ screenshots: true, snapshots: true });
    return new RecordedContext(context, dir);
  }

  /** Saves the trace, closes the context, and returns evidence paths. */
  async close(): Promise<{ trace: string; videos: string[] }> {
    const trace = path.join(this.dir, "trace.zip");
    await this.context.tracing.stop({ path: trace }).catch(() => {});
    await this.context.close();
    const videos = readdirSync(this.dir)
      .filter((f) => f.endsWith(".webm"))
      .map((f, i) => {
        const target = path.join(this.dir, i === 0 ? "video.webm" : `video-${i}.webm`);
        if (path.join(this.dir, f) !== target) renameSync(path.join(this.dir, f), target);
        return target;
      });
    return { trace, videos };
  }
}

export async function addToCart(page: Page, slug: string, quantity = 1) {
  await page.goto(`/products/${slug}`);
  const qty = page.getByTestId("add-quantity");
  if (await qty.count()) await qty.fill(String(quantity));
  await page.getByTestId(`add-to-cart-${slug}`).click();
  await page.waitForURL(/\/cart(\?|$)/);
}

export async function cartSubtotalText(page: Page): Promise<string> {
  return (await page.getByTestId("cart-subtotal").textContent())?.trim() ?? "";
}

/** Waits until the PayPal button is rendered and clickable on the cart page. */
export async function waitForPayPalButton(page: Page) {
  await page.locator("paypal-button:not([hidden])").first().waitFor({ state: "visible", timeout: 45_000 });
}

/** Opens the PayPal popup from the cart page and returns it with the PayPal order id (the popup's `token`). */
export async function openPayPalPopup(page: Page): Promise<{ popup: Page; paypalOrderId: string }> {
  await waitForPayPalButton(page);
  const popupPromise = page.context().waitForEvent("page", { timeout: 30_000 });
  await page.locator("paypal-button:not([hidden])").first().click();
  const popup = await popupPromise;
  await popup.waitForURL(/[?&]token=/, { timeout: 45_000 });
  const paypalOrderId = new URL(popup.url()).searchParams.get("token");
  if (!paypalOrderId) throw new Error("PayPal popup URL had no order token");
  return { popup, paypalOrderId };
}

/** Logs in as the sandbox buyer (if asked) and clicks the pay button in the PayPal popup. */
export async function approveInPopup(popup: Page, buyer: Buyer) {
  const email = popup.locator("#email");
  const payButton = popup.getByTestId("submit-button-initial").or(popup.locator("#payment-submit-btn")).first();

  await email.or(payButton).first().waitFor({ state: "visible", timeout: 60_000 });
  if (await email.isVisible()) {
    await email.fill(buyer.email);
    const next = popup.locator("#btnNext");
    if (await next.isVisible()) await next.click();
    const password = popup.locator("#password");
    await password.waitFor({ state: "visible", timeout: 30_000 });
    await password.fill(buyer.password);
    await popup.locator("#btnLogin").click();
  }
  await payButton.waitFor({ state: "visible", timeout: 90_000 });
  await payButton.click();
  await popup.waitForEvent("close", { timeout: 60_000 }).catch(() => {});
}

/**
 * Full PayPal purchase from the cart page: open popup, approve, and wait for the store
 * to reach `until` (success page by default). Retries once on a popup failure.
 */
export async function payWithPayPal(
  page: Page,
  buyer: Buyer,
  opts: { until?: "success" | "error"; log?: (msg: string) => void } = {},
): Promise<{ paypalOrderId: string; attempts: number }> {
  const until = opts.until ?? "success";
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { popup, paypalOrderId } = await openPayPalPopup(page);
      await approveInPopup(popup, buyer);
      if (until === "success") await page.waitForURL(/\/checkout\/success/, { timeout: 60_000 });
      else await page.locator('[role="alert"]').first().waitFor({ state: "visible", timeout: 60_000 });
      return { paypalOrderId, attempts: attempt };
    } catch (err) {
      lastError = err;
      opts.log?.(`PayPal attempt ${attempt} failed: ${(err as Error).message.split("\n")[0]}`);
      for (const p of page.context().pages()) if (p !== page) await p.close().catch(() => {});
      if (attempt === 1 && !/\/checkout\/success/.test(page.url())) await page.goto("/cart");
    }
  }
  throw lastError;
}

/** Pays on Stripe's hosted Checkout page with the 4242 test card. */
export async function payWithStripe(page: Page) {
  await page.getByTestId("checkout-stripe").click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  await page.getByRole("textbox", { name: "Email" }).fill("stripe-buyer@example.com");
  const cardNumber = page.locator("#cardNumber");
  if (!(await cardNumber.isVisible().catch(() => false))) {
    // The Card accordion button is a zero-size overlay; dispatch the click directly.
    await page.locator('[data-testid="card-accordion-item-button"]').dispatchEvent("click");
  }
  await cardNumber.fill("4242424242424242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("Test Buyer");
  const postal = page.locator("#billingPostalCode");
  if (await postal.isVisible().catch(() => false)) await postal.fill("10001");
  const link = page.locator("#enableStripePass");
  if (await link.isChecked().catch(() => false)) await link.uncheck();
  await page.locator('[data-testid="hosted-payment-submit-button"]').click();
  await page.waitForURL(/\/checkout\/success/, { timeout: 60_000 });
}

export async function successOrderId(page: Page): Promise<string> {
  const id = (await page.getByTestId("order-id").textContent())?.trim();
  if (!id) throw new Error("No order id on the success page");
  return id;
}

/** Refunds an order from the admin page and waits for it to show refunded. */
export async function refundFromAdmin(page: Page, orderId: string) {
  await page.goto("/admin/orders");
  const row = page.getByTestId(`order-row-${orderId}`);
  await row.getByTestId("refund-order").click();
  await row.getByTestId("order-status").filter({ hasText: "refunded" }).waitFor({ timeout: 30_000 });
}
