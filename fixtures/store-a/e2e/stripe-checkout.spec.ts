import { expect, test } from "@playwright/test";
import Stripe from "stripe";
import { addToCart, payOnStripeCheckout, readOrder } from "./helpers";

const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
const adminPassword = process.env.ADMIN_PASSWORD ?? "admin";

test.skip(!stripeKey.startsWith("sk_test_"), "Set STRIPE_SECRET_KEY (sk_test_...) in .env.local");

test("Stripe test purchase creates a paid order, and admin refund marks it refunded", async ({ page, browser }) => {
  // Cart: 1 x $19.99 + 2 x $34.50 = $88.99
  await addToCart(page, "canvas-tote", 1);
  await addToCart(page, "mug-set", 2);
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$88.99");

  await page.getByTestId("checkout-stripe").click();
  await payOnStripeCheckout(page);

  await page.waitForURL(/\/checkout\/success\?order_id=/, { timeout: 60_000 });
  await expect(page.getByTestId("order-status")).toHaveText("paid");
  await expect(page.getByTestId("order-total")).toHaveText("$88.99");
  await expect(page.getByTestId("cart-count")).toHaveText("0");
  const orderId = (await page.getByTestId("order-id").textContent())!.trim();

  // Database: the order is paid with the right total and line items.
  const { order, items } = readOrder(orderId);
  expect(order?.status).toBe("paid");
  expect(order?.totalCents).toBe(8899);
  expect(order?.paidAt).toBeTruthy();
  expect(order?.stripePaymentIntentId).toMatch(/^pi_/);
  expect(items).toEqual([
    { name: "Canvas Tote", unitPriceCents: 1999, quantity: 1, lineTotalCents: 1999 },
    { name: "Stoneware Mug Set (2)", unitPriceCents: 3450, quantity: 2, lineTotalCents: 6900 },
  ]);

  // Stripe's API agrees: the PaymentIntent succeeded for the same amount.
  const stripe = new Stripe(stripeKey);
  const pi = await stripe.paymentIntents.retrieve(order!.stripePaymentIntentId!);
  expect(pi.status).toBe("succeeded");
  expect(pi.amount_received).toBe(8899);

  // Admin refund.
  const admin = await browser.newContext({ httpCredentials: { username: "admin", password: adminPassword } });
  const adminPage = await admin.newPage();
  await adminPage.goto("/admin/orders");
  const row = adminPage.getByTestId(`order-row-${orderId}`);
  await row.getByTestId("refund-order").click();
  await expect(row.getByTestId("order-status")).toHaveText("refunded");
  await admin.close();

  const after = readOrder(orderId).order;
  expect(after?.status).toBe("refunded");
  expect(after?.refundedAt).toBeTruthy();

  const refunds = await stripe.refunds.list({ payment_intent: pi.id });
  expect(refunds.data).toHaveLength(1);
  expect(refunds.data[0].amount).toBe(8899);
  expect(["succeeded", "pending"]).toContain(refunds.data[0].status);
});
