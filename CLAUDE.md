# Second Button: build brief

Second Button is a GitHub App that adds PayPal checkout to a Stripe-only store, proves it works with a real PayPal sandbox purchase, and opens a pull request. After merge, it posts a "PayPal checkout" check on every later PR that re-runs the sandbox purchase.

Hackathon: PayPal AI Hackathon on Devpost. Deadline: Nov 12, 2026, 12:00 pm PT (3:00 pm ET).
Requirements: PayPal sandbox and AI both central, a working hosted demo or run instructions, a public repo with an open-source license, a demo video under 3 minutes.
Target prizes: Best Use of PayPal + AI, the grand prizes, and the APIMatic sponsor prize. Host on Render.

## Ground rules
- Sandbox and Stripe test mode only. Never commit secrets. Use env vars and keep `.env.example` files up to date.
- The AI never decides a run passed. Deterministic checks and PayPal's API do.
- Don't trust SDK method names from memory or from this file. Check them in the installed package's type definitions (`@paypal/paypal-server-sdk`) or the APIMatic Context Plugin before using them.
- PayPal webhook signature verification fails on simulator events. Test with real sandbox events. Read webhook headers case-insensitively.
- Prefer small, working increments. Each phase below ends with an acceptance check. Don't start the next phase until it passes.

## Scope
In: Next.js (App Router, TypeScript) stores that use Stripe Checkout Sessions and Prisma (SQLite in fixtures). PayPal one-time checkout: JS SDK v6 buttons, Pay Later messaging, Orders v2 create and capture, refunds, verified webhooks.
Out: other frameworks (Vite and React, Remix, TanStack Start), subscriptions, vault, Fastlane, multi-currency, production credentials.

## Repo layout (monorepo, pnpm workspaces)
```
apps/web        Next.js app: GitHub webhook receiver, dashboard, run reports, PayPal webhook relay (Render Web Service)
apps/worker     Node worker: agent + harness (Render Private Service, Docker image based on the official Playwright image)
packages/harness  Starts a store, drives Playwright, confirms via PayPal API, snapshots DB, compares with Stripe
packages/agent    Repo analysis, planning, code writing, guards, repair loop
packages/shared   Types, DB client (Postgres), job queue (pg-boss), PayPal and GitHub helpers
fixtures/store-a  Next.js + Stripe Checkout + Prisma store, order logic in lib/orders.ts
fixtures/store-b  Same features, different structure (logic inside route handlers)
```

## PayPal pieces every generated integration adds
| Piece | What | API |
|---|---|---|
| Browser token | Server route returning a browser-safe client token | POST /v1/oauth2/token with response_type=client_token |
| Buttons | JS SDK v6 (https://www.paypal.com/web-sdk/v6/core, sandbox host for testing), createInstance, findEligibleMethods, `<paypal-button>`, one-time payment session | JS SDK v6 |
| Pay Later | Pay Later messaging near the price | JS SDK v6 Pay Later |
| Create order | Builds the order from the server-side cart, never client amounts; send PayPal-Request-Id | POST /v2/checkout/orders (intent CAPTURE) |
| Capture | Called from onApprove; marks the store order paid; send PayPal-Request-Id | POST /v2/checkout/orders/{id}/capture |
| Refund | Admin action, updates the order | POST /v2/payments/captures/{id}/refund |
| Webhooks | Verify each event, process idempotently (store processed event IDs) | POST /v1/notifications/verify-webhook-signature; PAYMENT.CAPTURE.COMPLETED / DENIED / REFUNDED |

Server calls use the APIMatic-generated `@paypal/paypal-server-sdk`. Env vars: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_ENV. Add nullable `paymentProvider` and `paypalOrderId` to the order model via a Prisma migration. Never modify Stripe files.

## Harness scenarios (all must pass)
1. Single item, PayPal: PayPal order COMPLETED; store order paid; matches the Stripe snapshot
2. Several items with quantities: capture equals cart total to the cent; line items match Stripe
3. Buyer cancels in the popup: no paid order; cart intact
4. Payment declined (PayPal negative-testing request header): error shown, no paid order. If the header doesn't work in sandbox, drop this and say so in the report
5. Webhook delivered twice: fulfilled exactly once
6. Forged webhook: rejected
7. Tampered price from the browser: server charges the real total
8. Refund: order marked refunded, same as Stripe's refund path
9. Stripe still works: original Stripe flows pass unchanged

How a run works: clean checkout of the branch, install, migrate a fresh SQLite DB, build, start on localhost; Playwright buys with the sandbox buyer (wait for the PayPal popup page explicitly, retry once, save trace and video); confirm via GET /v2/checkout/orders/{id}; snapshot the DB; run the same cart through Stripe (test card 4242 4242 4242 4242); diff snapshots ignoring provider IDs. Webhooks reach the store through the web app's public relay, forwarded over Render's private network to the worker.

## Agent loop
Analyze the repo (checkout entry, cart model, order model, Stripe files) and save a JSON repo map. Plan files to add or edit (shown to the owner before code). Write the code with tools: read file, search, write file, run command, query the APIMatic Context Plugin. Build and guards: install, type check, lint, build, then four guards: every SDK method called exists in the installed types; no files outside the plan changed; Stripe files untouched; no secrets in the diff. Run the harness. On failure, repair using the exact evidence, editing only the files involved. Cap at 4 repair rounds, then open a draft PR that lists the failures. Save every attempt.

## GitHub App
Permissions: contents (read/write), pull requests (write), checks (write), metadata (read). Events: installation, pull_request (opened, synchronize), check_run (rerequested).
First PR: branch `second-button/add-paypal`, one commit per stage, a description with what changed, a scenario results table, a link to the run report, setup steps, and a "what I couldn't verify" list, plus a "PayPal checkout" check run.
Later PRs: harness only (no code generation), check passes or fails with a scenario table; on failure, post a review comment with the likely cause. Never push to someone else's branch. Skip runs when only docs or CI files change.

## Data model (Postgres)
installations(github_installation_id, repo_full_name, default_branch)
paypal_configs(installation_id, client_id, client_secret encrypted, webhook_id, sandbox buyer login encrypted)
runs(id, installation_id, kind add_paypal|check, commit_sha, pr_number, status, started_at, finished_at)
plans(run_id, repo_map json, file_plan json)
attempts(run_id, iteration, diff, failing_check, error_summary)
scenario_results(run_id, scenario, provider, status, paypal_order_id, api_evidence json, db_snapshot json, video_url, trace_url)

## Dashboard screens (apps/web)
1. Repos: connected repos, sandbox status, latest check result
2. Plan review: the agent's repo map and file plan, with an "Approve and build" button
3. Live run: streaming stages, scenarios, and each repair attempt with what caught it
4. Run report (linked from the PR): scenario table, Playwright video, PayPal API confirmation, Stripe and PayPal DB rows side by side, diff summary, "what I couldn't verify"
The run report is what judges see. Make it clean.

## Phases (do them in order)
Phase 1 (Mon night): pnpm monorepo scaffold; fixtures/store-a working with Stripe test mode (products, cart, checkout, orders, admin refund). Accept: a Stripe test purchase creates a paid order.
Phase 2 (Tue): hand-write the PayPal integration in a branch of store-a; build packages/harness with all scenarios and the Stripe parity diff; webhook relay. Accept: all scenarios pass on the hand-written code, with videos and evidence saved. This gate matters most.
Phase 3 (Tue to Wed): packages/agent. Remove the hand-written integration and have the agent rebuild it from the Stripe-only store. Accept: the agent produces a branch that passes the harness on store-a.
Phase 4 (Wed): GitHub App (PRs, check runs, review comments), dashboard and run report, Postgres and queue, deploy both services to Render. Then try fixtures/store-b.
Phase 5 (Thu morning): README (pitch, hosted URL, local run steps, tools used incl. model name, APIMatic plugin and SDK, Playwright, Render, scenario list, honest limits, comparison with the Devpost project Cutover), license, submit.
If time runs short, cut in this order: refund scenario, Pay Later messaging, store-b, review comments on failed checks.

Start with Phase 1. Before writing code, show me the plan for Phase 1 and the commands you'll run.
