import { expect, test } from "@playwright/test";
import { addToCart } from "./helpers";

test("cart totals come from server prices, and quantities update", async ({ page }) => {
  await addToCart(page, "enamel-pin", 3); // 3 x $7.45
  await addToCart(page, "canvas-tote", 1); // 1 x $19.99
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$42.34");
  await expect(page.getByTestId("cart-count")).toHaveText("4");

  const pin = page.getByTestId("cart-line-enamel-pin");
  await pin.getByTestId("line-quantity").fill("1");
  await pin.getByTestId("line-update").click();
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$27.44");

  await page.getByTestId("cart-line-canvas-tote").getByTestId("line-remove").click();
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$7.45");
});

test("a price sent by the browser is ignored", async ({ page }) => {
  await page.goto("/");
  const res = await page.request.get("/api/cart");
  expect(res.ok()).toBeTruthy();
  const productId = await page
    .getByTestId("product-wool-throw")
    .locator('input[name="productId"]')
    .getAttribute("value");
  const add = await page.request.post("/api/cart", {
    data: { action: "add", productId, quantity: 1, priceCents: 1, unitPriceCents: 1 },
  });
  const cart = await add.json();
  expect(cart.subtotalCents).toBe(12900);
});

test("cancel page keeps the cart", async ({ page }) => {
  await addToCart(page, "mug-set", 1);
  await page.goto("/checkout/cancel");
  await expect(page.getByTestId("checkout-result")).toHaveText("Checkout canceled");
  await page.getByTestId("back-to-cart").click();
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$34.50");
});

test("admin requires a password", async ({ request }) => {
  expect((await request.get("/admin/orders")).status()).toBe(401);
  expect((await request.post("/api/admin/orders/x/refund")).status()).toBe(401);
});
