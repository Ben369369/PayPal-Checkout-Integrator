# @paypal-checkout-integrator/harness

Proves a PayPal integration works by buying things with a real PayPal sandbox account, then checking the result with PayPal's API, the store's database, and a matching Stripe purchase. **The harness, not an AI, decides pass or fail.**

```bash
# from the repo root; credentials come from ./.env.local (see ../../.env.example)
pnpm --filter @paypal-checkout-integrator/harness run -- --ref store-a/paypal-reference --app fixtures/store-a
pnpm --filter @paypal-checkout-integrator/harness run -- --ref <branch> --app fixtures/store-a --scenarios 1,3,7 --headed
```

## What a run does

1. Clean checkout of `--ref` into a temp worktree (no uncommitted files, no stale builds).
2. If `cloudflared` is available: start the webhook relay behind a quick tunnel, and register a PayPal webhook for this run (deleted afterwards).
3. `pnpm install --frozen-lockfile`, migrate a fresh SQLite DB, seed, `next build`, `next start` on a free port.
4. Run the scenarios in Playwright, recording a video and trace for each one.
5. Write `runs/<runId>/results.json`, plus `store.log`, `webhook-events.json`, and a folder per scenario.

## Scenarios

| # | Scenario | Passes when |
|---|---|---|
| 1 | Single item, PayPal | PayPal API says COMPLETED for the cart total; DB order is paid and linked to the capture; the same cart through Stripe gives the same DB rows (ignoring provider IDs and timestamps) |
| 2 | Several items with quantities | Capture equals the cart total to the cent; PayPal, Stripe, and DB line items match |
| 3 | Buyer cancels in the popup | No paid order; cart unchanged; PayPal order not completed |
| 4 | Payment declined | Capture is sent with the sandbox `PayPal-Mock-Response: INSTRUMENT_DECLINED` header; the buyer sees an error; no paid order |
| 5 | Webhook delivered twice | A real, signed `PAYMENT.CAPTURE.COMPLETED` is replayed twice; it's accepted, recorded once, and the order is unchanged |
| 6 | Forged webhook | An unsigned event and a real signature on an altered body are both rejected; nothing is recorded |
| 7 | Tampered price | The browser's create-order request is rewritten to $0.01; PayPal still charges the real total |
| 8 | Refund | Admin refund marks the order refunded; PayPal's capture is REFUNDED; the refund webhook is accepted; Stripe's refund path ends in the same DB state |
| 9 | Stripe still works | A Stripe Checkout purchase still succeeds, with the right total, and isn't marked as PayPal |

## Webhook relay

PayPal can't reach a store on localhost, so the harness runs a **pull-model relay**: a public tunnel URL receives PayPal's deliveries and stores them unchanged, and the harness then replays them to the store with PayPal's original `paypal-*` headers. PayPal verifies signatures from the headers, body, and webhook ID, not from the URL, so replayed events verify like direct deliveries. Replaying is also how scenarios 5 and 6 deliver an event twice, or with a changed body.

Install `cloudflared` (`winget install Cloudflare.cloudflared`), or set `CLOUDFLARED_PATH`. Without it, scenario 5 is skipped and scenario 6 only tests the unsigned forgery.

## Store contract

The harness drives fixture stores through these `data-testid`s: `add-to-cart-<slug>`, `add-quantity`, `cart-subtotal`, `checkout-stripe`, `order-id`, `order-status`, `order-row-<id>`, `refund-order`. On the PayPal side it uses only the SDK's own `<paypal-button>` element and any `[role="alert"]` error message. It also expects `/checkout/success` after payment, `/admin/orders` behind basic auth (`admin` / `ADMIN_PASSWORD`), and a webhook route at `/api/webhooks/paypal`.
