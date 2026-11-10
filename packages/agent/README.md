# @paypal-checkout-integrator/agent

The agent that adds PayPal checkout to a Stripe-only store. It reads the repository, plans the change, writes the code, and repairs it until the [harness](../harness) passes on a real PayPal sandbox purchase. **The AI never decides a run passed.** Deterministic checks and PayPal's API do.

```bash
# from the repo root, with ANTHROPIC_API_KEY plus the PayPal/Stripe sandbox values in ./.env.local
pnpm --filter @paypal-checkout-integrator/agent run -- --base main --app fixtures/store-a --yes
```

Flags: `--repo <path>` (default: this repo), `--base <ref>`, `--app <subdir>`, `--branch <name>`, `--max-repairs 4`, `--scenarios 1,2,3`, `--yes` (approve the plan without a prompt).

## How a run works

| Stage | What happens | Tools |
|---|---|---|
| Setup | New worktree and branch `paypal-checkout-integrator/add-paypal-<runId>` from `--base`; install; scratch SQLite DB | n/a |
| 1. Analyze | Writes a **repo map**: checkout entry, cart, order model, Stripe files, success page, admin refund, webhook dedupe, migrations | read only |
| 2. Plan | Writes a **file plan**: each file, its stage, and its purpose. Shown to the owner for approval before any code is written | read only, plus APIMatic |
| 3. Implement | Writes the code, then runs install, type check, lint, and build until clean | writes restricted to the plan |
| Commit | One commit per stage: dependencies, database, server, client, config | n/a |
| Checks | install → type check → lint → build, then four guards (below) | n/a |
| Harness | Clean checkout of the branch and all 9 real-sandbox scenarios | n/a |
| Repair | On any failure, the exact evidence (failed checks, PayPal/Stripe API responses, server log) goes back to the agent, which edits only the involved files. Up to 4 rounds, one commit each | writes restricted to the plan |

Everything is saved under `agent-runs/<runId>/`: `repo-map.json`, `plan.json`, a transcript per stage (`transcript-*.jsonl`), and an `attempt-N/` folder per check round (`diff.patch`, `attempt.json`, and `evidence.md` when a repair followed). `report.json` holds the final status, commits, APIMatic queries, token usage, and estimated cost.

## Guards (deterministic)

1. **SDK methods exist.** The TypeScript type checker resolves every call on a `@paypal/paypal-server-sdk` object against the installed `.d.ts` files, and fails on unknown members or SDK values cast to `any`.
2. **Only planned files changed.** The diff against the base is compared to the approved plan, plus `package.json` and the lockfile.
3. **Stripe files untouched.** No file the repo map lists as Stripe code may appear in the diff.
4. **No secrets in the diff.** It checks known key formats, plus the exact values of the configured PayPal, Stripe, and Anthropic credentials.

## Model and tools

- `claude-opus-5-5` with adaptive thinking at effort `high`, streamed. Large file writes use eager input streaming. The system prompt and tools are identical across stages, so the prompt prefix is cached. Server-side refusal fallback (`fallbacks: "default"`) is on, so a declined request continues on another model instead of stopping the run.
- **APIMatic Context Plugin** for the PayPal Server SDK (TypeScript), at `chatbotapi.apimatic.io/mcp/.../typescript`, a streamable-HTTP MCP server. The agent can call `paypal_sdk_endpoint_search`, `paypal_sdk_model_search`, and `paypal_sdk_ask`, and each query is logged in `report.json`.
- `search_sdk_types` and `read_file` on `node_modules/@paypal/paypal-server-sdk`, so names are confirmed against the installed SDK version.
- `run_command` accepts only an allowlist (`pnpm add/install`, `prisma generate/migrate deploy/migrate diff`, type check, lint, build). Its environment has every credential removed.
