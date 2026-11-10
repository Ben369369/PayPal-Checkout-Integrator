# PayPal Checkout Integrator

**by Chui Labs**

A GitHub App that adds PayPal checkout to a Stripe-only store, proves it works with a real PayPal sandbox purchase, and opens a pull request. Once merged, it re-runs that sandbox purchase as a **"PayPal checkout"** check on every later pull request.

The AI writes the code. Deterministic checks and PayPal's own API decide whether it works.

- **Hosted app:** https://paypal-checkout-integrator.onrender.com (dashboard behind a password; run reports are public)
- **Demo store:** [Ben369369/tidepool-store](https://github.com/Ben369369/tidepool-store), a Next.js + Stripe store the app adds PayPal to
- Built for the PayPal AI Hackathon. **Sandbox and Stripe test mode only.**

## How it works

1. **Install the app** on a repository. It shows up on the dashboard.
2. **Click "Add PayPal checkout".** A Claude agent (`claude-opus-5-5`) reads the store and writes a **repo map**: the checkout, cart, order model, and every Stripe file. It then writes a **file plan**.
3. **Approve the plan.** Nothing is written until the owner approves it on the dashboard.
4. **The agent writes the integration.**
   - Server: the APIMatic-generated `@paypal/paypal-server-sdk` (Orders v2 create/capture, refunds).
   - Browser: the PayPal JS SDK v6 `<paypal-button>` and Pay Later messaging.
   - Also: verified, idempotent webhooks, and a Prisma migration.
   - Before using any SDK name, the agent checks it with the APIMatic Context Plugin and the installed type definitions.
5. **Deterministic gates.** Install, type check, lint, and build, then four guards:
   - every SDK method called exists in the installed types (checked by the TypeScript compiler);
   - only planned files changed;
   - Stripe files are untouched;
   - no secrets are in the diff.
6. **Proof.** The harness builds the branch and buys products with a real PayPal sandbox buyer in Playwright. It confirms each result with PayPal's API and the store's database, and buys the same cart through Stripe to compare the database rows.
7. **Repair.** If anything fails, the agent gets the exact evidence (failed checks, API responses, server log) and edits only the files involved. It gets up to 4 rounds.
8. **Pull request.** The PR has one commit per stage, a scenario table, a link to the run report, setup steps, and a "what I couldn't verify" list. It also gets a "PayPal checkout" check run.
9. **Later PRs.** These run only the harness, with no code generation. The check passes or fails. On failure the app posts a review comment with a likely cause, labeled as AI-written. Docs-only and CI-only PRs are skipped.

## The nine scenarios

| # | Scenario | Passes when |
|---|---|---|
| 1 | Single item | PayPal API says COMPLETED; order paid; DB rows match the same Stripe purchase |
| 2 | Several items with quantities | Capture equals the cart total to the cent; PayPal, Stripe, and DB line items match |
| 3 | Buyer cancels in the popup | No paid order; cart intact |
| 4 | Payment declined | Sandbox negative testing (`PayPal-Mock-Response: INSTRUMENT_DECLINED`); buyer sees an error; no paid order |
| 5 | Webhook delivered twice | A real signed `PAYMENT.CAPTURE.COMPLETED` is accepted once and acknowledged as a duplicate |
| 6 | Forged webhook | Unsigned events and a real signature on an altered body are rejected |
| 7 | Tampered price from the browser | The create-order request is rewritten to $0.01; PayPal still charges the real total |
| 8 | Refund | Admin refund marks the order refunded; PayPal shows the capture REFUNDED; the refund webhook is accepted; same end state as a Stripe refund |
| 9 | Stripe still works | The original Stripe Checkout flow passes unchanged |

**Results so far:**
- Starting from the Stripe-only store, the agent produced a branch that passed all nine on its **first attempt**: 5 commits, 19 files, 10 APIMatic queries, about $3.50 of model usage.
- A hand-written reference integration also passes all nine.

### Real webhooks for a store that isn't public

The store under test runs on a private machine, so PayPal can't reach it. The app runs a **pull-model webhook relay** instead:

1. For each run, the harness registers a temporary PayPal webhook that points at the hosted relay.
2. The relay stores each delivery byte for byte.
3. The harness replays it to the store with PayPal's original `paypal-*` headers.

PayPal verifies signatures from the headers, body, and webhook id, not from the delivery URL, so replayed events verify like direct deliveries. Replays are also how scenario 5 delivers an event twice and scenario 6 alters one. (The simulator's events can't be used, because they fail signature verification.)

## Architecture

```
apps/web          Next.js on Render: GitHub webhooks, dashboard, plan review, live run log,
                  public run reports, PayPal webhook relay, GitHub App manifest setup
apps/worker       Job runner (pg-boss): clones as the app, runs the agent and harness,
                  pushes the branch, opens the PR, posts check runs and review comments
packages/agent    Claude agent: analyze → plan → implement → guards → repair loop
packages/harness  Real-sandbox scenario runner, Stripe parity diff, webhook relay
packages/shared   Postgres schema, encrypted settings, queue, GitHub App client
fixtures/store-a  The demo store (published as tidepool-store)
docs/             Chui Labs design spec
```

- **Hosting:** the web app and Postgres run on Render's free tier. The worker needs a browser and about 2 GB of RAM, so it runs on the owner's machine and pulls jobs from the hosted database. Moving it to a Render instance requires no code changes.
- **Security:**
  - The GitHub App's private key and per-repo sandbox credentials are encrypted at rest (AES-256-GCM).
  - Commands the agent runs get no credentials.
  - The agent's file writes are restricted to the approved plan, and Stripe files are always blocked.

## Run it

**Requirements:** Node 22+, pnpm, a PayPal sandbox app with a sandbox Personal (buyer) account, a Stripe test key, an Anthropic API key, and [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) for local webhook delivery.

```bash
pnpm install
cp .env.example .env.local        # fill in the sandbox and test credentials
pnpm --filter @paypal-checkout-integrator/harness exec playwright install chromium

# prove a branch with the harness
pnpm --filter @paypal-checkout-integrator/harness run -- --ref <branch> --app fixtures/store-a

# have the agent add PayPal to the Stripe-only store and prove it
pnpm --filter @paypal-checkout-integrator/agent run -- --base main --app fixtures/store-a --yes
```

**Hosted setup:**
1. Deploy `render.yaml` as a Render Blueprint and set `DASHBOARD_PASSWORD` when asked.
2. Open `/setup` and click **Create the GitHub App**. The app is created from a manifest with exactly the permissions it needs.
3. Install the app on a repository.
4. Run the worker: put `DATABASE_URL` (external), `ENCRYPTION_KEY`, and `PUBLIC_URL` from Render in `.env.local`, then run `pnpm --filter @paypal-checkout-integrator/worker start`.

Evidence for every run is saved: videos, Playwright traces, PayPal API responses, DB snapshots, and agent transcripts. It goes to `runs/` and `agent-runs/` locally. Hosted runs upload it to the run report.

## Built with

- **Claude `claude-opus-5-5`** via the Anthropic TypeScript SDK: a streaming tool-use loop with adaptive thinking, prompt caching, and server-side refusal fallback.
- **APIMatic Context Plugin** for the PayPal Server SDK (TypeScript), called by the agent over MCP, and the APIMatic-generated **`@paypal/paypal-server-sdk`**.
- PayPal JS SDK v6, Orders v2, Payments, webhooks, and sandbox negative testing.
- Next.js 16, Prisma 7, Stripe Checkout, Playwright, Postgres and pg-boss, Octokit, Render, Cloudflare quick tunnels.

## Honest limits

- **Scope:**
  - Only Next.js App Router stores that use Stripe Checkout Sessions and Prisma.
  - Only one-time PayPal checkout: no subscriptions, vaulting, or multi-currency.
  - Tested on one store so far. A second store with a different structure is planned.
- **Pay Later messaging isn't verified.** PayPal only renders it on HTTPS pages, so on the harness's localhost store we only check that the element is present.
- **Speed and cost:** a full add-PayPal run takes about 35 minutes (about 25 for the agent, about 8 for real sandbox purchases) and costs about $3.50 in model usage. A later-PR check takes about 10 minutes.
- **Scenario 4 needs a test hook.** It relies on the generated capture route forwarding `PayPal-Mock-Response`, and only when `PAYPAL_ENV=sandbox`.
- **The worker runs on the owner's machine**, so checks only run while it's on. The free Render web service sleeps when idle, so the worker pings it to keep GitHub and PayPal webhooks flowing.
- **Single owner:** the dashboard is protected by one shared password.

## How this differs from Cutover

[Cutover](https://devpost.com/software/cutover) is another PayPal + AI project on Devpost. Its page describes an AI agent that **migrates legacy PayPal integrations** to newer PayPal APIs, and proves in the sandbox that checkout behaves the same ("7 of 7 scenarios identical", verified by PayPal), with live old and migrated demo shops. It's a strong idea, and we share its core belief: let PayPal's sandbox API, not the model, decide whether checkout works.

PayPal Checkout Integrator differs in four ways:

| | Cutover (per its Devpost page) | PayPal Checkout Integrator |
|---|---|---|
| Starting point | A store that already uses PayPal (legacy APIs) | A store that has **never** used PayPal (Stripe only) |
| Reference for "correct" | The store's old PayPal behavior | The store's **Stripe** behavior: a DB-row diff of the same cart paid both ways |
| Delivery | Migrated shop | A **GitHub App**: plan approval, a PR with one commit per stage, a check run, and a run report |
| After the first change | n/a | A **"PayPal checkout" check on every later PR**, so regressions are caught before merge |

## License

MIT © 2026 Chui Labs
