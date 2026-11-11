# Devpost submission draft

Paste each section into the matching Devpost field. Lines starting with **TODO** are for you to fill in or confirm.

---

## Project name
PayPal Checkout Integrator

## Tagline (max 200 characters)
Add PayPal to a custom-built store without touching code. An AI agent writes the integration; nine real PayPal sandbox purchases, not the AI, decide if it works.

## Links
- Live app: https://paypal-checkout-integrator.onrender.com
- Source: https://github.com/Ben369369/PayPal-Checkout-Integrator
- Real test report: https://paypal-checkout-integrator.onrender.com/runs/85837239-b6c8-415d-a4a2-65cc8c1c00fb/report
- **TODO:** demo video URL (YouTube, unlisted is fine)

## Built with (tags)
paypal, paypal-js-sdk, paypal-orders-api, apimatic, claude, anthropic, typescript, next.js, react, prisma, postgresql, stripe, playwright, github-apps, octokit, pg-boss, render, cloudflare

---

## Inspiration

Many small online stores weren't built on Shopify or Wix. A freelancer, an agency, or more and more often an AI site builder made them, and the code sits in a GitHub repository the owner never opens. These stores almost always take cards through Stripe, and almost never offer PayPal, even though many shoppers look for the PayPal button at checkout.

Adding PayPal properly is not a one-line change. It needs a server SDK, a client token, a database migration, signed webhooks handled exactly once, refunds, and protection against a shopper editing the price in their browser. Then you have to prove none of it broke card payments. For a non-technical owner, that means paying a developer for days of work or not offering PayPal at all.

AI coding tools can write this code, but an owner can't tell whether AI-written payment code is correct. We wanted the opposite of "trust the AI": let PayPal's own records decide.

**TODO:** add one personal sentence about why Chui Labs cares about this (for example, a store owner you know).

## What it does

PayPal Checkout Integrator is a GitHub App with a web dashboard, built for store owners who can't code.

1. **Sign in with GitHub and connect your store.** Everything is in plain English by default, with a Developer view for technical users.
2. **Click "Add PayPal checkout".** A Claude agent reads the store and writes a plan. The owner sees it as four short lists: what customers will see, what changes, what stays the same, and what they need to do. Nothing happens until they click "Looks good, build it".
3. **The agent adds PayPal next to the card checkout:** the PayPal JS SDK v6 button, Pay Later messaging, Orders v2 create and capture, refunds, and verified webhooks. It uses the APIMatic-generated PayPal Server SDK.
4. **A robot shopper makes nine real PayPal sandbox purchases:**
   - one item, and several items with quantities;
   - a cancel halfway through, and a declined payment;
   - a duplicated webhook, and a forged one;
   - a price tampered with in the browser;
   - a refund;
   - the original card checkout, to prove it still works.

   PayPal's Orders API confirms every result. The same cart is also bought through Stripe, and the store's database rows are compared field by field.
5. **The owner gets a pull request with a green "PayPal checkout" check** and a public test report, with the purchase video, PayPal's record of the order, and the Stripe and PayPal rows side by side. Accepting it is one click.
6. **Every later change is re-tested.** In our demo, a later "simplification" sent the total from the browser. The check went red, 7 of 9, because PayPal captured $0.01 for a $129 order. A plain-English comment explained why before anyone merged it.

## How we built it

- **Agent:** Claude (`claude-opus-5-5`) in a streaming tool-use loop with adaptive thinking and prompt caching.
  - It writes a repo map and a file plan as structured output, then implements stage by stage with read, search, write, and command tools.
  - Before using any PayPal SDK name, it asks the **APIMatic Context Plugin** over MCP (13 lookups in the hosted run).
- **Guards:** after the AI writes code, nothing it says counts.
  - Install, type check, lint, and build.
  - Every SDK method called must exist in the installed `@paypal/paypal-server-sdk` types, checked by the TypeScript compiler.
  - Only planned files may change; Stripe files must be untouched; no secrets may be in the diff.
- **Harness:** Playwright drives the real PayPal sandbox popup, then confirms with `GET /v2/checkout/orders/{id}`.
  - The decline scenario uses PayPal's negative testing header.
  - Webhooks come from real signed sandbox events. A pull-model relay on the hosted app stores each delivery byte for byte, and the harness replays it to the store under test. That is how we test duplicates and forgeries with real signatures, which the webhook simulator can't do.
- **Repair loop:** on failure, the agent gets the exact evidence and edits only the files involved, for up to 4 rounds.
- **Plain English:** a second, cheaper Claude call uses structured outputs to turn the plan and results into owner-friendly language, labeled as AI-written. It never decides pass or fail.
- **Product:** a Next.js app on Render handles Sign in with GitHub, the dashboard, public run reports, GitHub webhooks, and the PayPal webhook relay. A pg-boss worker runs the agent and the browser; all of it runs on Postgres. Secrets are encrypted at rest with AES-256-GCM.

## Challenges we ran into

- **PayPal's webhook simulator events fail signature verification,** and the store under test isn't publicly reachable. We built the store-and-replay relay so that every webhook scenario uses real, verifiable PayPal events.
- **The v6 client token.** The sandbox rejects `domains[]=localhost`, so the generated integration only sends domains for real hosts.
- **Proving "it works" without trusting the AI.** We compare against the store's existing Stripe behavior: the same cart paid both ways must produce matching database rows, ignoring provider IDs.
- **Explaining payment changes to someone who can't code.** The first plain-English plans asked owners to choose between technical options. We rewrote the rules so the owner's only decision is yes or no.

## Accomplishments that we're proud of

- **9 of 9 on a hosted run, end to end:** from a Stripe-only store to a pull request with a green check in about 30 minutes, for $3.38 of model usage, with no code repairs needed.
- **It caught a real bug.** The price-tampering scenario found a change that let a shopper pay one cent for a $129 order.
- **A clean split between the AI and the checks.** The AI writes, explains, and suggests causes, but only PayPal's API and deterministic checks decide.
- **The product is usable by someone who has never opened their store's code.**

## What we learned

- Sandbox APIs are the best judge of AI-written payment code: PayPal's order and capture records don't hallucinate.
- Giving the agent a documentation tool (the APIMatic Context Plugin), plus a compiler check that the methods exist, removed a whole class of invented-SDK-method errors.
- Non-technical users don't want options; they want a plan they can say yes to and proof it worked.

## What's next for PayPal Checkout Integrator

- Support for more store stacks, starting with a second Next.js structure, then Vite with React and Remix.
- Running the test robot in the cloud, so checks run around the clock.
- Guided go-live: switching to the owner's live PayPal account with a final real-money purchase and refund.
- More PayPal features: Venmo, Fastlane, and saved payment methods.
