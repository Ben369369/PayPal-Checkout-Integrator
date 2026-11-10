import Link from "next/link";
import { notFound } from "next/navigation";
import { getInstallation, getPlan, getRun, listAttempts, type PlainPlan, type PlainResult } from "@paypal-checkout-integrator/shared";
import { AutoRefresh } from "@/components/AutoRefresh";
import { LiveLog } from "@/components/LiveLog";
import { kindLabel, Status } from "@/components/Status";
import { canAccess, requireUser } from "@/lib/auth";
import { PLAIN_STATUS, PLAIN_STEPS, plainStepIndex } from "@/lib/plain";
import { duration, ensureDb, formatDate } from "@/lib/server";
import { currentView } from "@/lib/view";
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
};
type Summary = { passed?: number; total?: number; plain?: PlainResult | null };

const ADD_STAGES = ["clone", "analyze", "plan", "implement", "check", "publish"];

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3>{title}</h3>
      <ul className="plain-list">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

function ApproveButtons({ runId, simple }: { runId: string; simple: boolean }) {
  return (
    <form action={decidePlanAction} className="actions">
      <input type="hidden" name="runId" value={runId} />
      <button className="btn" type="submit" name="decision" value="approve">
        {simple ? "Looks good, build it" : "Approve and build"}
      </button>
      <button className="btn secondary" type="submit" name="decision" value="reject">
        {simple ? "No thanks" : "Reject"}
      </button>
    </form>
  );
}

export default async function RunPage({ params }: PageProps<"/runs/[id]">) {
  await ensureDb();
  const { id } = await params;
  const user = await requireUser(`/runs/${id}`);
  const run = await getRun(id);
  if (!run) notFound();
  const inst = await getInstallation(run.installation_id);
  if (!inst || !canAccess(user, inst)) notFound();
  const [plan, attempts, view] = await Promise.all([getPlan(run.id), listAttempts(run.id), currentView()]);
  const filePlan = plan?.file_plan as FilePlan | undefined;
  const repoMap = plan?.repo_map as RepoMap | undefined;
  const plainPlan = plan?.plain as PlainPlan | null | undefined;
  const summary = (run.summary ?? null) as Summary | null;
  const done = ["passed", "failed", "error", "skipped", "rejected"].includes(run.status);
  const waiting = run.status === "awaiting_approval";
  const storeName = inst.repo_full_name.split("/")[1];

  /* ------------------------------ Simple view ------------------------------ */
  if (view === "simple") {
    const stepIndex = plainStepIndex(run.status, run.stage);
    const plainResult = summary?.plain ?? null;
    return (
      <>
        <p className="kicker">
          {storeName} · {run.kind === "add_paypal" ? "Adding PayPal" : `Re-test of change #${run.pr_number}`}
        </p>
        <h1>{PLAIN_STATUS[run.status] ?? run.status}</h1>

        {run.kind === "add_paypal" && (
          <ol className="stages" aria-label="Progress">
            {PLAIN_STEPS.map((s, i) => (
              <li key={s.key} className={i < stepIndex ? "done" : i === stepIndex ? "current" : undefined}>
                {s.label}
              </li>
            ))}
          </ol>
        )}

        {summary?.total ? (
          <section className="section">
            <div className="big-number">
              {summary.passed} <span className="of">of {summary.total} test purchases passed</span>
            </div>
            {plainResult ? (
              <>
                <p className="finding">{plainResult.headline}</p>
                <p className="ai-note">Explained by AI from the test results. Pass or fail comes from PayPal&apos;s own records.</p>
                <p className="lede">{plainResult.whatThisMeans}</p>
                <div className="grid-2" style={{ marginTop: 16 }}>
                  <Bullets title="What we checked" items={plainResult.whatWeChecked} />
                  <Bullets title="Next steps" items={plainResult.nextSteps} />
                </div>
              </>
            ) : (
              <p className="finding">{run.status === "passed" ? "Everything worked with real PayPal test purchases." : "Some test purchases didn't work. See the details below."}</p>
            )}
            <div className="actions">
              {run.kind === "add_paypal" && run.pr_url && run.status === "passed" && (
                <a className="btn" href={run.pr_url}>
                  Accept the change on GitHub
                </a>
              )}
              {run.kind === "check" && run.pr_url && (
                <a className="btn secondary" href={run.pr_url}>
                  Open the change on GitHub
                </a>
              )}
              <Link className="btn secondary" href={`/runs/${run.id}/report`}>
                See the full test report
              </Link>
            </div>
            {run.kind === "add_paypal" && run.status === "passed" && (
              <p className="hint">
                On GitHub, click the green <strong>Merge pull request</strong> button, then <strong>Confirm merge</strong>. Your site shows PayPal the next time it&apos;s published.
              </p>
            )}
          </section>
        ) : null}

        {(filePlan || waiting) && (
          <section className={`section${waiting ? " selected" : ""}`}>
            <p className="kicker teal">The plan, explained by AI</p>
            <h2>{waiting ? "Here's what we'd like to do. Is that OK?" : "The plan you approved"}</h2>
            {plainPlan ? (
              <>
                <p className="finding">{plainPlan.headline}</p>
                <div className="grid-2" style={{ marginTop: 16 }}>
                  <Bullets title="What your customers will see" items={plainPlan.whatCustomersWillSee} />
                  <Bullets title="What we'll change" items={plainPlan.whatWeWillChange} />
                  <Bullets title="What stays the same" items={plainPlan.whatStaysTheSame} />
                  <Bullets title="What you'll need to do" items={plainPlan.whatYouNeedToDo} />
                </div>
              </>
            ) : (
              <p className="finding">{filePlan?.summary ?? "The plan is being written…"}</p>
            )}
            {repoMap && (
              <p className="small muted" style={{ marginTop: 12 }}>
                Your card payments ({repoMap.stripeFiles.length} files) will not be touched. Developers can see every file in the Developer view.
              </p>
            )}
            {waiting && <ApproveButtons runId={run.id} simple />}
          </section>
        )}

        {!done && !waiting && (
          <section className="section">
            <p className="finding">
              {stepIndex <= 1
                ? "We're reading your store and writing a plan. You'll be asked to approve it in a few minutes."
                : stepIndex === 3
                  ? "We're adding PayPal checkout now. This usually takes 15 to 20 minutes. You can close this page; we'll keep working."
                  : "A robot shopper is making real PayPal test purchases on your store. About 10 minutes."}
            </p>
          </section>
        )}
        {run.status === "error" && <p className="fail">Something went wrong on our side. You can start again from your store page.</p>}
        {!done && <AutoRefresh seconds={waiting ? 15 : 5} />}
      </>
    );
  }

  /* ---------------------------- Developer view ---------------------------- */
  const currentStage = run.stage?.split(/[-\s]/)[0] ?? "";
  const stageIndex = ADD_STAGES.indexOf(currentStage === "repair" ? "check" : currentStage);
  return (
    <>
      <p className="kicker">
        {kindLabel(run.kind)} · {inst.repo_full_name}
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
        <section className={`section${waiting ? " selected" : ""}`}>
          <p className="kicker teal">Plan written by the agent</p>
          <h2>{waiting ? "Review the plan before any code is written" : "The approved plan"}</h2>
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
          {waiting && <ApproveButtons runId={run.id} simple={false} />}
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
