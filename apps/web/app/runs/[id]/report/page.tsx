import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInstallation, getPlan, getRun, listAttempts, listScenarioResults, type PlainResult, type ScenarioRow } from "@paypal-checkout-integrator/shared";
import { Badge, ScenarioTiles, ScoreRing } from "@/components/app/Visuals";
import { Icon } from "@/components/landing/Icons";
import { statusLabel } from "@/components/Status";
import { duration, ensureDb, formatDate, publicUrl } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/runs/[id]/report">): Promise<Metadata> {
  const { id } = await params;
  await ensureDb();
  const run = await getRun(id);
  const inst = run ? await getInstallation(run.installation_id) : null;
  return { title: inst ? `Run report: ${inst.repo_full_name}` : "Run report" };
}

type Summary = {
  passed?: number;
  total?: number;
  attempts?: number;
  apimaticQueries?: { tool: string; args: Record<string, unknown> }[];
  commits?: { sha: string; message: string }[];
  planSummary?: string;
  couldNotVerify?: string[];
  model?: string;
  webhookEvents?: number;
  plain?: PlainResult | null;
};
type PayPalOrderEvidence = {
  id: string;
  status: string;
  amount?: { currency_code: string; value: string };
  items?: { name: string; quantity: string; unitAmount: { value: string } }[];
  captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[];
};

const PROVIDER_FIELD = /^(id|cartId|createdAt|paidAt|refundedAt|customerEmail|paymentProvider|stripe\w*|paypal\w*)$/;

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" && v > 1e12) return new Date(v).toISOString();
  return String(v);
}

function SideBySide({ s }: { s: ScenarioRow }) {
  const pp = s.db_snapshot?.paypal;
  const st = s.db_snapshot?.stripe;
  if (!pp || !st) return null;
  const keys = [...new Set([...Object.keys(pp.order), ...Object.keys(st.order)])];
  const differs = (k: string) => !PROVIDER_FIELD.test(k) && fmt(pp.order[k]) !== fmt(st.order[k]);
  const column = (label: string, snap: NonNullable<typeof pp>, winner: boolean) => (
    <div className={`side${winner ? " winner" : ""}`}>
      <h3>{label}</h3>
      <div className="kv">
        {keys.map((k) => (
          <div key={k} style={{ display: "contents" }}>
            <div className="k">{k}</div>
            <div className={PROVIDER_FIELD.test(k) ? "provider mono" : differs(k) ? "differs mono" : "mono"}>{fmt(snap.order[k])}</div>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        {(snap.items as { name: string; quantity: number; lineTotalCents: number }[]).map((i) => `${i.quantity} × ${i.name} (${(i.lineTotalCents / 100).toFixed(2)})`).join(" · ")}
      </p>
    </div>
  );
  return (
    <div className="duel">
      {column("PayPal order", pp, true)}
      {column("Stripe order, same cart", st, false)}
    </div>
  );
}

/** PayPal's own record of the purchase, drawn as a receipt. */
function Receipt({ order }: { order: PayPalOrderEvidence }) {
  const capture = order.captures?.[0];
  return (
    <div className="receipt">
      <div className="receipt-head">
        <Icon name="receipt" size={22} />
        <strong>PayPal&apos;s record</strong>
        <span style={{ marginLeft: "auto" }}>
          <Badge status={order.status === "COMPLETED" ? "passed" : "failed"}>{order.status}</Badge>
        </span>
      </div>
      <div className="receipt-row">
        <span>Order</span>
        <code>{order.id}</code>
      </div>
      {(order.items ?? []).map((i) => (
        <div className="receipt-row" key={i.name}>
          <span>
            {i.quantity} × {i.name}
          </span>
          <span>{i.unitAmount.value}</span>
        </div>
      ))}
      {capture && (
        <div className="receipt-row">
          <span>Capture</span>
          <span>
            <code>{capture.id}</code> · {capture.status}
          </span>
        </div>
      )}
      <div className="receipt-row receipt-total">
        <span>Total charged</span>
        <span>
          {capture?.amount.value ?? order.amount?.value} {capture?.amount.currency_code ?? order.amount?.currency_code}
        </span>
      </div>
    </div>
  );
}

export default async function ReportPage({ params }: PageProps<"/runs/[id]/report">) {
  await ensureDb();
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();
  const [inst, scenarios, plan, attempts] = await Promise.all([getInstallation(run.installation_id), listScenarioResults(run.id), getPlan(run.id), listAttempts(run.id)]);
  const summary = (run.summary ?? {}) as Summary;
  const passed = scenarios.filter((s) => s.status === "pass").length;
  const total = scenarios.length;
  const purchases = scenarios.filter((s) => s.paypal_order_id).length;
  const primary = scenarios.find((s) => s.scenario === 2 && s.db_snapshot?.stripe) ?? scenarios.find((s) => s.db_snapshot?.stripe && s.db_snapshot?.paypal);
  const firstPurchase = scenarios.find((s) => s.scenario === 1) ?? scenarios[0];
  const paypalOrder = (firstPurchase?.api_evidence as { paypalOrder?: PayPalOrderEvidence } | null)?.paypalOrder;
  const filePlan = plan?.file_plan as { files: { path: string; action: string }[] } | undefined;
  const allPassed = total > 0 && passed === total;
  const sha = run.commit_sha?.slice(0, 7);

  return (
    <>
      <div className="app-hero">
        <div>
          <p className="kicker">Run report · {inst?.repo_full_name}</p>
          <h1>{run.kind === "add_paypal" ? "PayPal checkout, added and proven in the PayPal sandbox" : `PayPal checkout check on pull request #${run.pr_number}`}</h1>
          <p className="finding">
            {total === 0
              ? `This run has no scenario results yet. Status: ${statusLabel(run.status)}.`
              : allPassed
                ? `A sandbox buyer completed ${purchases} PayPal checkouts${sha ? ` on commit ${sha}` : ""}. PayPal's API confirmed each result, and the database rows matched the same carts bought through Stripe.`
                : `${total - passed} scenario${total - passed === 1 ? "" : "s"} failed${sha ? ` on commit ${sha}` : ""}. The failing checks and their evidence are below.`}
          </p>
          <div className="fact-strip">
            <span>
              <Icon name="clock" size={16} /> {formatDate(run.started_at ?? run.created_at)} · {duration(run.started_at, run.finished_at)}
            </span>
            {run.pr_url && (
              <span>
                <Icon name="github" size={16} /> <a href={run.pr_url}>Pull request #{run.pr_number}</a>
              </span>
            )}
            <span>
              <Icon name="shield" size={16} /> Decided by PayPal&apos;s API and deterministic checks, not the AI
            </span>
          </div>
        </div>
        {total > 0 && (
          <div className="app-hero-art">
            <ScoreRing passed={passed} total={total} label="scenarios" size={156} />
          </div>
        )}
      </div>

      {summary.plain && (
        <section className="section selected">
          <p className="kicker teal">In plain English, explained by AI</p>
          <p className="finding" style={{ marginTop: 0 }}>
            {summary.plain.headline}
          </p>
          <p className="lede">{summary.plain.whatThisMeans}</p>
          {summary.plain.nextSteps.length > 0 && (
            <ul className="plain-list">
              {summary.plain.nextSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {total > 0 && (
        <section className="section">
          <p className="kicker">Scenarios</p>
          <h2>{total === 9 ? "Nine ways a real checkout can go wrong, each tried for real" : "Each scenario, tried for real"}</h2>
          <ScenarioTiles rows={scenarios} developer traceBase={publicUrl()} />
        </section>
      )}

      {(firstPurchase?.video_url || paypalOrder) && (
        <section className="section">
          <p className="kicker">Proof</p>
          <h2>The purchase, recorded, and PayPal&apos;s own record of it</h2>
          <p className="lede">
            Scenario {firstPurchase?.scenario}: the harness adds to cart, opens PayPal, logs in as the sandbox buyer, and pays. Then it calls GET /v2/checkout/orders/{paypalOrder?.id ?? "{id}"}{" "}
            to confirm.
          </p>
          <div className="split" style={{ marginTop: 18 }}>
            {firstPurchase?.video_url && (
              <div className="video-frame">
                <video src={`${firstPurchase.video_url}#t=4`} controls muted playsInline preload="metadata" />
              </div>
            )}
            {paypalOrder && <Receipt order={paypalOrder} />}
          </div>
        </section>
      )}

      {primary && (
        <section className="section">
          <p className="kicker">Parity with Stripe</p>
          <h2>Stripe and PayPal, side by side</h2>
          <p className="finding">
            {primary.parity_diff?.length
              ? `${primary.parity_diff.length} field${primary.parity_diff.length === 1 ? "" : "s"} differ beyond provider IDs and timestamps.`
              : "The rows match: only provider IDs and timestamps differ."}
          </p>
          <p className="small muted" style={{ marginBottom: 16 }}>
            Scenario {primary.scenario}: the same cart paid once with PayPal and once with Stripe test card 4242. Provider-specific fields are dimmed.
          </p>
          <SideBySide s={primary} />
        </section>
      )}

      {run.kind === "add_paypal" && (summary.commits?.length || filePlan) && (
        <section className="section">
          <p className="kicker">The code</p>
          <h2>What changed</h2>
          {summary.planSummary && (
            <>
              <p className="kicker teal">Summary written by the agent</p>
              <p className="lede">{summary.planSummary.length > 420 ? `${summary.planSummary.slice(0, 420).trimEnd()}…` : summary.planSummary}</p>
              {summary.planSummary.length > 420 && (
                <details className="more">
                  <summary>Read the agent&apos;s full summary</summary>
                  <p className="lede small">{summary.planSummary}</p>
                </details>
              )}
            </>
          )}
          <div className="grid-2" style={{ marginTop: 16 }}>
            <div>
              <h3>Commits</h3>
              <ul className="small">
                {(summary.commits ?? []).map((c) => (
                  <li key={c.sha}>
                    <code>{c.sha.slice(0, 7)}</code> {c.message}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Files</h3>
              <ul className="small">
                {(filePlan?.files ?? []).map((f) => (
                  <li key={f.path}>
                    <code>{f.path}</code> <span className="muted">({f.action})</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <dl className="details" style={{ marginTop: 16 }}>
            <dt>Attempts</dt>
            <dd>
              {attempts.length} {attempts.length === 1 ? "(passed on the first try)" : `(${attempts.filter((a) => a.failing_check).length} caught by checks, then repaired)`}
            </dd>
            <dt>Guards</dt>
            <dd>SDK methods verified against installed types · only planned files changed · Stripe files untouched · no secrets in the diff</dd>
            {summary.apimaticQueries && (
              <>
                <dt>APIMatic queries</dt>
                <dd>
                  {summary.apimaticQueries.length}:{" "}
                  {summary.apimaticQueries.map((q, i) => (
                    <span key={i}>
                      <code>{q.tool}</code> {String(Object.values(q.args)[0] ?? "").slice(0, 40)}
                      {i < summary.apimaticQueries!.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </dd>
              </>
            )}
            {summary.model && (
              <>
                <dt>Model</dt>
                <dd>
                  <code>{summary.model}</code>
                  {run.cost_usd ? `, about $${run.cost_usd}` : ""}
                </dd>
              </>
            )}
          </dl>
        </section>
      )}

      <section className="section">
        <p className="kicker">Honest limits</p>
        <h2>What we couldn&apos;t verify</h2>
        <ul>
          {(summary.couldNotVerify?.length ? summary.couldNotVerify : ["Nothing beyond the scenarios above."]).map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
