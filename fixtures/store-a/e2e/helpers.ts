import Database from "better-sqlite3";
import { expect, type Page } from "@playwright/test";

/** Read-only handle on the e2e SQLite database. */
export function openDb() {
  return new Database("prisma/e2e.db", { readonly: true, fileMustExist: true });
}

export type OrderRow = {
  id: string;
  status: string;
  totalCents: number;
  subtotalCents: number;
  currency: string;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  paidAt: unknown;
  refundedAt: unknown;
};

export function readOrder(orderId: string) {
  const db = openDb();
  try {
    const order = db.prepare(`SELECT * FROM "Order" WHERE id = ?`).get(orderId) as OrderRow | undefined;
    const items = db
      .prepare(`SELECT name, unitPriceCents, quantity, lineTotalCents FROM "OrderItem" WHERE orderId = ? ORDER BY name`)
      .all(orderId) as { name: string; unitPriceCents: number; quantity: number; lineTotalCents: number }[];
    return { order, items };
  } finally {
    db.close();
  }
}

/**
 * Fills Stripe's hosted Checkout page with the 4242 test card and submits.
 * Selectors are Stripe's; if Stripe changes its page, this is the place to fix.
 */
export async function payOnStripeCheckout(page: Page, email = "buyer@example.com") {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

  await page.getByRole("textbox", { name: "Email" }).fill(email);

  // When several payment methods are enabled, Stripe lists them; expand Card.
  const cardNumber = page.locator("#cardNumber").or(page.getByLabel("Card number"));
  if (!(await cardNumber.first().isVisible().catch(() => false))) {
    // The accordion button is a zero-size overlay, so dispatch the click directly.
    await page.locator('[data-testid="card-accordion-item-button"]').dispatchEvent("click");
  }
  await cardNumber.first().fill("4242424242424242");
  await page.locator("#cardExpiry").or(page.getByLabel(/expiration/i)).first().fill("12 / 34");
  await page.locator("#cardCvc").or(page.getByLabel(/cvc|security code/i)).first().fill("123");
  await page.locator("#billingName").or(page.getByLabel(/cardholder name|name on card/i)).first().fill("Test Buyer");

  const postal = page.locator("#billingPostalCode").or(page.getByLabel(/zip|postal/i)).first();
  if (await postal.isVisible().catch(() => false)) await postal.fill("10001");

  // Don't opt in to Link (it would ask for a phone number).
  const link = page.locator("#enableStripePass");
  if (await link.isChecked().catch(() => false)) await link.uncheck();

  await page
    .locator('[data-testid="hosted-payment-submit-button"]')
    .or(page.getByRole("button", { name: "Pay", exact: true }))
    .first()
    .click();
}

export async function addToCart(page: Page, slug: string, quantity = 1) {
  await page.goto(`/products/${slug}`);
  await page.getByTestId("add-quantity").fill(String(quantity));
  await page.getByTestId(`add-to-cart-${slug}`).click();
  await expect(page).toHaveURL(/\/cart$/);
}
