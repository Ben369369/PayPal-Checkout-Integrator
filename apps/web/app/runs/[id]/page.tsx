import Link from "next/link";
import { notFound } from "next/navigation";
import { getInstallation, getPlan, getRun, listAttempts } from "@paypal-checkout-integrator/shared";
import { LiveLog } from "@/components/LiveLog";
import { kindLabel, Status } from "@/components/Status";
import { duration, ensureDb, formatDate } from "@/lib/server";
import { decidePlanAction } from "../../actions";

export const dynamic = "force-dynamic";

type PlanFile = { path: string; action: string; stage: string; purpose: string };
type FilePlan = { summary: string; files: PlanFile[]; dependencies: string[]; envVars: string[]; risks: string[] };
type RepoMap = {
  framework: string;
  orm: string;
  checkoutEntry: { files: string[]; description: string };
  orderModel: { prismaModel: string; description: string };
  stripeFiles: string[];
  successPage: { route: string };
};

const ADD_STAGES = ["clone", "analyze", "plan", "implement", "check", "publish"];

export default async function RunPage({ params }: PageProps<"/runs/[id]">) {
  await ensureDb();
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();
  const [inst, plan, attempts] = await Promise.all([getInstallation(run.installation_id), getPlan(run.id), listAttempts(run.id)]);
  const filePlan = plan?.file_plan as FilePlan | undefined;
  const repoMap = plan?.repo_map as RepoMap | undefined;
  const summary = run.summary as { passed?: number; total?: number } | null;
  const done = ["passed", "failed", "error", "skipped", "rejected"].includes(run.status);
  const currentStage = run.stage?.split(/[-\s]/)[0] ?? "";
  const stageIndex = ADD_STAGES.indexOf(currentStage === "repair" ? "check" : currentStage);

  return (
    <>
      <p className="kicker">
        {kindLabel(run.kind)} · {inst?.repo_full_name}
      </p>
      <h1>
        {run.kind === "add_paypal" ? "Adding PayPal checkout" : `Checking pull request #${run.pr_number}`}: <Status value={run.status} />
      </h1>
      {summary?.total ? (
        <div className="big-number">
          {summary.passed} <span className="of">of {summary.total} sandbox scenarios passed</span>
        </div>
      ) : null}
      <dl className="details" style={{ marginTop: 16 }}>
        <dt>Started</dt>
        <dd>{formatDate(run.started_at ?? run.created_at)}</dd>
        <dt>Took</dt>
        <dd>{duration(run.started_at, run.finished_at)}</dd>
        {run.pr_url && (
          <>
            <dt>Pull request</dt>
            <dd>
              <a href={run.pr_url}>#{run.pr_number}</a>
            </dd>
          </>
        )}
        {run.commit_sha && (
          <>
            <dt>Commit</dt>
            <dd>
              <code>{run.commit_sha.slice(0, 10)}</code>
            </dd>
          </>
        )}
        {run.cost_usd && (
          <>
            <dt>Model usage</dt>
            <dd>about ${run.cost_usd}</dd>
          </>
        )}
      </dl>
      {done && run.status !== "rejected" && (
        <div className="actions">
          <Link className="btn" href={`/runs/${run.id}/report`}>
            Open the run report
          </Link>
        </div>
      )}
      {run.error && <p className="fail">{run.error}</p>}

      {run.kind === "add_paypal" && (
        <ol className="stages" aria-label="Stages">
          {ADD_STAGES.map((s, i) => (
            <li key={s} className={done || i < stageIndex ? "done" : i === stageIndex ? "current" : undefined}>
              {s[0].toUpperCase() + s.slice(1)}
            </li>
          ))}
        </ol>
      )}

      {filePlan && (
        <section className={`section${run.status === "awaiting_approval" ? " selected" : ""}`}>
          <p className="kicker teal">Plan written by the agent</p>
          <h2>{run.status === "awaiting_approval" ? "Review the plan before any code is written" : "The approved plan"}</h2>
          <p className="finding">{filePlan.summary}</p>
          {repoMap && (
            <dl className="details" style={{ marginTop: 20 }}>
              <dt>Store</dt>
              <dd>
                {repoMap.framework}, {repoMap.orm}
              </dd>
              <dt>Checkout</dt>
              <dd>{repoMap.checkoutEntry.files.map((f) => <code key={f}>{f} </code>)}</dd>
              <dt>Orders</dt>
              <dd>{repoMap.orderModel.prismaModel} model</dd>
              <dt>Stripe files</dt>
              <dd>
                {repoMap.stripeFiles.length} files, none will be modified: {repoMap.stripeFiles.map((f) => <code key={f}>{f} </code>)}
              </dd>
            </dl>
          )}
          <div className="table-wrap" style={{ marginTop: 20 }}>
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Change</th>
                  <th>Stage</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                {filePlan.files.map((f) => (
                  <tr key={f.path}>
                    <td>
                      <code>{f.path}</code>
                    </td>
                    <td>{f.action}</td>
                    <td className="muted">{f.stage}</td>
                    <td className="small">{f.purpose.length > 260 ? `${f.purpose.slice(0, 260)}…` : f.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filePlan.risks.length > 0 && (
            <>
              <h3 style={{ marginTop: 20 }}>Risks the agent flagged</h3>
              <ul>
                {filePlan.risks.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}
          {run.status === "awaiting_approval" && (
            <form action={decidePlanAction} className="actions">
              <input type="hidden" name="runId" value={run.id} />
              <button className="btn" type="submit" name="decision" value="approve">
                Approve and build
              </button>
              <button className="btn secondary" type="submit" name="decision" value="reject">
                Reject
              </button>
            </form>
          )}
        </section>
      )}

      {attempts.length > 0 && (
        <section className="section">
          <h2>Attempts</h2>
          <p className="lede">Each attempt is checked by install, type check, lint, build, four guards, and then real sandbox purchases. Repairs see the exact evidence.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Commit</th>
                  <th>What caught it</th>
                  <th>Repair</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.iteration} className={!a.failing_check ? "row-selected" : undefined}>
                    <td>{a.iteration}</td>
                    <td>
                      <code>{a.commit_sha?.slice(0, 8)}</code>
                    </td>
                    <td>{a.failing_check ? <span className="fail">{a.failing_check}</span> : <span className="pass">Nothing: all checks passed</span>}</td>
                    <td className="small">{a.repair?.summary ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="section">
        <h2>Live log</h2>
        <LiveLog runId={run.id} initialStatus={run.status} />
      </section>
    </>
  );
}
