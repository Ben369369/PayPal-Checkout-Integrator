import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInstallation, getPlan, getRun, listAttempts, listScenarioResults, type PlainResult, type ScenarioRow } from "@paypal-checkout-integrator/shared";
import { PLAIN_SCENARIOS } from "@/lib/plain";
import { Status } from "@/components/Status";
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

function PayPalApi({ order }: { order: PayPalOrderEvidence }) {
  const capture = order.captures?.[0];
  return (
    <dl className="details">
      <dt>Order</dt>
      <dd>
        <code>{order.id}</code> · <strong>{order.status}</strong>
      </dd>
      <dt>Amount</dt>
      <dd>
        {order.amount?.value} {order.amount?.currency_code}
      </dd>
      {capture && (
        <>
          <dt>Capture</dt>
          <dd>
            <code>{capture.id}</code> · <strong>{capture.status}</strong> · {capture.amount.value} {capture.amount.currency_code}
          </dd>
        </>
      )}
      {order.items && (
        <>
          <dt>Line items</dt>
          <dd>{order.items.map((i) => `${i.quantity} × ${i.name} at ${i.unitAmount.value}`).join(" · ")}</dd>
        </>
      )}
    </dl>
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
  const base = publicUrl();
  const allPassed = total > 0 && passed === total;
  const sha = run.commit_sha?.slice(0, 7);

  return (
    <>
      <p className="kicker">Run report · {inst?.repo_full_name}</p>
      <h1>{run.kind === "add_paypal" ? "PayPal checkout, added and proven in the PayPal sandbox" : `PayPal checkout check on pull request #${run.pr_number}`}</h1>

      {total > 0 ? (
        <>
          <div className="big-number">
            {passed} <span className="of">of {total} scenarios passed</span>
          </div>
          <p className="finding">
            {allPassed
              ? `A sandbox buyer completed ${purchases} PayPal checkouts${sha ? ` on commit ${sha}` : ""}. PayPal's API confirmed each result, and the database rows matched the same carts bought through Stripe.`
              : `${total - passed} scenario${total - passed === 1 ? "" : "s"} failed${sha ? ` on commit ${sha}` : ""}. The failing checks and their evidence are below.`}
          </p>
        </>
      ) : (
        <p className="finding">
          This run has no scenario results yet. Status: <Status value={run.status} />.
        </p>
      )}

      {summary.plain && (
        <section className="section selected">
          <p className="kicker teal">In plain English, explained by AI</p>
          <p className="finding" style={{ marginTop: 0 }}>{summary.plain.headline}</p>
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

      <dl className="details" style={{ marginTop: 20 }}>
        <dt>Run</dt>
        <dd>
          {formatDate(run.started_at ?? run.created_at)} · {duration(run.started_at, run.finished_at)}
        </dd>
        {run.pr_url && (
          <>
            <dt>Pull request</dt>
            <dd>
              <a href={run.pr_url}>#{run.pr_number}</a>
            </dd>
          </>
        )}
        <dt>Decided by</dt>
        <dd>PayPal&apos;s Orders and Payments API, the store&apos;s database, and deterministic checks. Not the AI.</dd>
      </dl>

      {total > 0 && (
        <section className="section">
          <h2>Scenarios</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Scenario</th>
                  <th>Result</th>
                  <th>PayPal order</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => {
                  const failed = s.checks.filter((c) => !c.pass);
                  return (
                    <tr key={s.scenario}>
                      <td>{s.scenario}</td>
                      <td>
                        {s.name}
                        {PLAIN_SCENARIOS[s.scenario] && <div className="small muted">{PLAIN_SCENARIOS[s.scenario]}</div>}
                        {(failed.length > 0 || s.error) && <div className="small fail">{s.error ?? failed.map((c) => c.name).join("; ")}</div>}
                        {s.status === "skipped" && s.notes?.[0] && <div className="small muted">{s.notes[0]}</div>}
                      </td>
                      <td>
                        <Status value={s.status} />
                        <div className="small muted">
                          {s.checks.filter((c) => c.pass).length} of {s.checks.length} checks
                        </div>
                      </td>
                      <td>{s.paypal_order_id ? <code>{s.paypal_order_id}</code> : ""}</td>
                      <td className="small">
                        {s.video_url && <a href={s.video_url}>Video</a>}
                        {s.video_url && s.trace_url && " · "}
                        {s.trace_url && <a href={`https://trace.playwright.dev/?trace=${encodeURIComponent(`${base}${s.trace_url}`)}`}>Trace</a>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {firstPurchase?.video_url && (
        <section className="section">
          <h2>The purchase, recorded</h2>
          <p className="lede">Scenario {firstPurchase.scenario}: the harness adds to cart, opens PayPal, logs in as the sandbox buyer, and pays.</p>
          <video src={firstPurchase.video_url} controls preload="metadata" />
        </section>
      )}

      {paypalOrder && (
        <section className="section">
          <h2>What PayPal&apos;s API returned</h2>
          <p className="lede">GET /v2/checkout/orders/{paypalOrder.id}, called by the harness after the purchase.</p>
          <PayPalApi order={paypalOrder} />
        </section>
      )}

      {primary && (
        <section className="section">
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
          <h2>What changed</h2>
          {summary.planSummary && (
            <>
              <p className="kicker teal">Summary written by the agent</p>
              <p className="lede">{summary.planSummary}</p>
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
