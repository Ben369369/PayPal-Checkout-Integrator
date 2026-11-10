import Link from "next/link";
import { notFound } from "next/navigation";
import { getInstallation, getPlan, getRun, listAttempts, listScenarioResults, type PlainPlan, type PlainResult } from "@paypal-checkout-integrator/shared";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Badge, ScenarioTiles, ScoreRing, Tracker, Working, type TrackerStep } from "@/components/app/Visuals";
import { Icon, type IconName } from "@/components/landing/Icons";
import { LiveLog } from "@/components/LiveLog";
import { kindLabel, statusLabel } from "@/components/Status";
import { canAccess, requireUser } from "@/lib/auth";
import { PLAIN_STATUS, PLAIN_STEPS, plainStepIndex } from "@/lib/plain";
import { duration, ensureDb, formatDate, publicUrl } from "@/lib/server";
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

const ADD_STAGES: TrackerStep[] = [
  { key: "clone", label: "Clone", icon: "github" },
  { key: "analyze", label: "Analyze", icon: "search" },
  { key: "plan", label: "Plan", icon: "list" },
  { key: "implement", label: "Implement", icon: "code" },
  { key: "check", label: "Check", icon: "shield" },
  { key: "publish", label: "Publish", icon: "arrow" },
];
const PLAIN_ICONS: Record<string, IconName> = { read: "search", plan: "list", approve: "user", build: "wrench", test: "cart", ready: "github" };
const PLAIN_TRACKER: TrackerStep[] = PLAIN_STEPS.map((s) => ({ key: s.key, label: s.label, icon: PLAIN_ICONS[s.key] }));
const WORKING: Record<number, { icon: IconName; title: string; text: string }> = {
  0: { icon: "search", title: "Reading your store", text: "We're finding your cart, your orders, and your card checkout. You'll be asked to approve a plan in a few minutes." },
  1: { icon: "list", title: "Writing a plan", text: "Our AI is writing down exactly what it will change. You'll see it here in plain English before anything happens." },
  3: { icon: "wrench", title: "Adding PayPal checkout", text: "Our AI is adding PayPal next to your card payments. This usually takes 15 to 20 minutes. You can close this page; we'll keep working." },
  4: { icon: "cart", title: "Making real test purchases", text: "A robot shopper is buying from your store in PayPal's test mode, and PayPal's own records decide pass or fail. About 10 minutes." },
  5: { icon: "github", title: "Preparing the change for you", text: "Everything passed. We're putting the finished change on GitHub for you to accept." },
};

function PlanCard({ icon, title, items }: { icon: IconName; title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="plan-card">
      <h3>
        <span>
          <Icon name={icon} size={18} />
        </span>
        {title}
      </h3>
      <ul>
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
      <button className="btn btn-lg" type="submit" name="decision" value="approve">
        <Icon name="check" size={18} /> {simple ? "Looks good, build it" : "Approve and build"}
      </button>
      <button className="btn btn-lg secondary" type="submit" name="decision" value="reject">
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
  const [plan, attempts, view, scenarios] = await Promise.all([getPlan(run.id), listAttempts(run.id), currentView(), listScenarioResults(run.id)]);
  const filePlan = plan?.file_plan as FilePlan | undefined;
  const repoMap = plan?.repo_map as RepoMap | undefined;
  const plainPlan = plan?.plain as PlainPlan | null | undefined;
  const summary = (run.summary ?? null) as Summary | null;
  const done = ["passed", "failed", "error", "skipped", "rejected"].includes(run.status);
  const waiting = run.status === "awaiting_approval";
  const stopped = ["failed", "error", "rejected"].includes(run.status);
  const storeName = inst.repo_full_name.split("/")[1];

  /* ------------------------------ Simple view ------------------------------ */
  if (view === "simple") {
    const stepIndex = plainStepIndex(run.status, run.stage);
    const plainResult = summary?.plain ?? null;
    const trackerAt = run.status === "rejected" ? 2 : stopped ? Math.max(plainStepIndex("running", run.stage), 4) : stepIndex;
    const working = WORKING[stepIndex];
    return (
      <>
        <div className="app-hero">
          <div>
            <p className="kicker">
              {storeName} · {run.kind === "add_paypal" ? "Adding PayPal" : `Re-test of change #${run.pr_number}`}
            </p>
            <h1>{PLAIN_STATUS[run.status] ?? run.status}</h1>
            {summary?.total ? (
              <>
                <p className="finding">
                  {plainResult?.headline ?? (run.status === "passed" ? "Everything worked with real PayPal test purchases." : "Some test purchases didn't work. See the details below.")}
                </p>
                {plainResult && <p className="ai-note">Explained by AI from the test results. Pass or fail comes from PayPal&apos;s own records.</p>}
                <div className="actions">
                  {run.kind === "add_paypal" && run.pr_url && run.status === "passed" && (
                    <a className="btn btn-lg" href={run.pr_url}>
                      <Icon name="github" size={18} /> Accept the change on GitHub
                    </a>
                  )}
                  {run.kind === "check" && run.pr_url && (
                    <a className="btn btn-lg secondary" href={run.pr_url}>
                      <Icon name="github" size={18} /> Open the change on GitHub
                    </a>
                  )}
                  <Link className="btn btn-lg secondary" href={`/runs/${run.id}/report`}>
                    <Icon name="receipt" size={18} /> See the full test report
                  </Link>
                </div>
                {run.kind === "add_paypal" && run.status === "passed" && (
                  <p className="hint">
                    On GitHub, click the green <strong>Merge pull request</strong> button, then <strong>Confirm merge</strong>. Your site shows PayPal the next time it&apos;s published.
                  </p>
                )}
              </>
            ) : waiting ? (
              <p className="finding">Our AI has a plan for your store. Read it below and tell us if it&apos;s OK. Nothing changes until you say yes.</p>
            ) : null}
            {run.status === "error" && <p className="fail">Something went wrong on our side. You can start again from your store page.</p>}
          </div>
          {summary?.total ? (
            <div className="app-hero-art">
              <ScoreRing passed={summary.passed ?? 0} total={summary.total} label="tests passed" />
            </div>
          ) : null}
        </div>

        {run.kind === "add_paypal" && (
          <section className="section">
            <Tracker steps={PLAIN_TRACKER} current={trackerAt} stopped={stopped} />
          </section>
        )}

        {!done && !waiting && working && (
          <section className="section">
            <Working icon={working.icon} title={working.title} text={working.text} />
          </section>
        )}

        {scenarios.length > 0 && (
          <section className="section">
            <p className="kicker">The test purchases</p>
            <h2>{run.status === "passed" ? "Every test purchase worked" : "What worked and what didn't"}</h2>
            {plainResult && <p className="lede">{plainResult.whatThisMeans}</p>}
            <ScenarioTiles rows={scenarios} />
            {plainResult && plainResult.nextSteps.length > 0 && (
              <div className="plan-grid">
                <PlanCard icon="arrow" title="Next steps" items={plainResult.nextSteps} />
              </div>
            )}
          </section>
        )}

        {(filePlan || waiting) && (
          <section className={`section${waiting ? " selected" : ""}`}>
            <p className="kicker teal">The plan, explained by AI</p>
            <h2>{waiting ? "Here's what we'd like to do. Is that OK?" : "The plan you approved"}</h2>
            {plainPlan ? (
              <>
                <p className="finding">{plainPlan.headline}</p>
                <div className="plan-grid">
                  <PlanCard icon="eye" title="What your customers will see" items={plainPlan.whatCustomersWillSee} />
                  <PlanCard icon="wrench" title="What we'll change" items={plainPlan.whatWeWillChange} />
                  <PlanCard icon="shield" title="What stays the same" items={plainPlan.whatStaysTheSame} />
                  <PlanCard icon="user" title="What you'll need to do" items={plainPlan.whatYouNeedToDo} />
                </div>
              </>
            ) : (
              <p className="finding">{filePlan?.summary ?? "The plan is being written…"}</p>
            )}
            {repoMap && (
              <p className="small muted" style={{ marginTop: 14 }}>
                Your card payments ({repoMap.stripeFiles.length} files) will not be touched. Developers can see every file in the Developer view.
              </p>
            )}
            {waiting && <ApproveButtons runId={run.id} simple />}
          </section>
        )}

        {!done && <AutoRefresh seconds={waiting ? 15 : 5} />}
      </>
    );
  }

  /* ---------------------------- Developer view ---------------------------- */
  const currentStage = run.stage?.split(/[-\s]/)[0] ?? "";
  const stageIndex = ADD_STAGES.findIndex((s) => s.key === (currentStage === "repair" || currentStage === "Scenario" ? "check" : currentStage));
  const trackerAt = run.status === "passed" ? ADD_STAGES.length : stageIndex >= 0 ? stageIndex : done ? ADD_STAGES.length - 1 : 0;
  return (
    <>
      <div className="app-hero">
        <div>
          <p className="kicker">
            {kindLabel(run.kind)} · {inst.repo_full_name}
          </p>
          <h1>{run.kind === "add_paypal" ? "Adding PayPal checkout" : `Checking pull request #${run.pr_number}`}</h1>
          <p>
            <Badge status={run.status}>{statusLabel(run.status)}</Badge>
          </p>
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
                <Icon name="receipt" size={16} /> Open the run report
              </Link>
            </div>
          )}
        </div>
        {summary?.total ? (
          <div className="app-hero-art">
            <ScoreRing passed={summary.passed ?? 0} total={summary.total} label="scenarios" />
          </div>
        ) : null}
      </div>
      {run.error && <p className="fail">{run.error}</p>}

      {run.kind === "add_paypal" && (
        <section className="section">
          <Tracker steps={ADD_STAGES} current={trackerAt} stopped={stopped} />
        </section>
      )}

      {scenarios.length > 0 && (
        <section className="section">
          <h2>Scenarios</h2>
          <ScenarioTiles rows={scenarios} developer traceBase={publicUrl()} />
        </section>
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
