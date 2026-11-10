# PayPal Checkout Integrator

**by Chui Labs**

A GitHub App that adds PayPal checkout to a Stripe-only store, proves it works with a real PayPal sandbox purchase, and opens a pull request. Once merged, it re-runs that sandbox purchase as a **"PayPal checkout"** check on every later pull request.

The AI writes the code. It never decides whether the code works: deterministic checks and PayPal's own API do.

> Built for the PayPal AI Hackathon. Sandbox and Stripe test mode only.

## What it does

1. **Reads your store.** A Claude agent (`claude-opus-5-5`) maps the checkout, cart, order model, and every Stripe file, then writes a file plan for you to approve.
2. **Writes the integration.** The server uses the APIMatic-generated `@paypal/paypal-server-sdk` for Orders v2 and refunds; the browser uses the PayPal JS SDK v6 button and Pay Later messaging. The agent checks SDK names against the installed types and APIMatic's Context Plugin before using them, and never touches Stripe files.
3. **Proves it.** A harness builds the branch and buys things with a real PayPal sandbox account, then confirms the result with PayPal's API, the store's database, and the same cart bought through Stripe.
4. **Repairs and ships.** If a check fails, the agent gets the exact evidence and fixes only the files involved (at most 4 rounds). Then it opens a PR with a scenario table and a link to the run report.

## The nine scenarios

| # | Scenario | Passes when |
|---|---|---|
| 1 | Single item | PayPal API says COMPLETED; order paid; DB rows match the same Stripe purchase |
| 2 | Several items with quantities | Capture equals the cart total to the cent; line items match |
| 3 | Buyer cancels in the popup | No paid order; cart intact |
| 4 | Payment declined | Buyer sees an error; no paid order |
| 5 | Webhook delivered twice | A real signed event is fulfilled exactly once |
| 6 | Forged webhook | Rejected, including a real signature on an altered body |
| 7 | Tampered price from the browser | PayPal charges the real total |
| 8 | Refund | Order refunded in PayPal and the DB; same end state as a Stripe refund |
| 9 | Stripe still works | The original Stripe flow passes unchanged |

**Latest result:** starting from the Stripe-only store, the agent produced a branch that passed all nine on its first attempt (5 commits, 19 files, 10 APIMatic queries, about $3.50 of model usage).

## Repository layout

```
packages/agent     The Claude agent: analyze, plan, implement, guards, repair loop
packages/harness   Real-sandbox scenario runner, Stripe parity diff, webhook relay
packages/shared    Shared types and clients (in progress)
apps/web           GitHub App webhooks, dashboard, run reports (in progress)
apps/worker        Runs the agent and harness jobs (in progress)
fixtures/store-a   Demo store: Next.js 16, Prisma + SQLite, Stripe Checkout
docs/              Chui Labs design spec
```

## Run it locally

Requirements: Node 22+, pnpm, a PayPal sandbox app with a sandbox buyer account, a Stripe test key, an Anthropic API key, and [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) for real webhook delivery.

```bash
pnpm install
cp .env.example .env.local        # fill in the sandbox and test credentials
pnpm --filter @paypal-checkout-integrator/harness exec playwright install chromium

# run the harness against a branch
pnpm --filter @paypal-checkout-integrator/harness run -- --ref <branch> --app fixtures/store-a

# have the agent add PayPal to the Stripe-only store and prove it
pnpm --filter @paypal-checkout-integrator/agent run -- --base main --app fixtures/store-a --yes
```

Evidence for every run (videos, Playwright traces, PayPal API responses, DB snapshots, agent transcripts) is written to `runs/` and `agent-runs/`.

## Built with

Claude (`claude-opus-5-5`) via the Anthropic TypeScript SDK · APIMatic Context Plugin and the APIMatic-generated PayPal Server SDK · PayPal JS SDK v6 · Next.js · Prisma · Playwright · Cloudflare quick tunnels · Render (hosting, in progress)

## License

MIT © 2026 Chui Labs
