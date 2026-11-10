import Link from "next/link";
import { notFound } from "next/navigation";
import { getInstallation, getSandboxSettings, listRuns, type Run } from "@paypal-checkout-integrator/shared";
import { Badge, StoreMock } from "@/components/app/Visuals";
import { Icon } from "@/components/landing/Icons";
import { kindLabel, statusLabel } from "@/components/Status";
import { canAccess, requireUser } from "@/lib/auth";
import { PLAIN_STATUS } from "@/lib/plain";
import { ensureDb, formatDate } from "@/lib/server";
import { currentView } from "@/lib/view";
import { saveSettingsAction, startAddPaypalAction } from "../../actions";

export const dynamic = "force-dynamic";

type Settings = Awaited<ReturnType<typeof getSandboxSettings>>;

function SettingsForm({ installationId, settings, simple }: { installationId: number; settings: Settings; simple: boolean }) {
  const saved = (v: unknown, fallback = "") => (v ? "Saved" : fallback);
  return (
    <form action={saveSettingsAction}>
      <input type="hidden" name="installationId" value={installationId} />
      <div className="grid-2">
        <div>
          <label htmlFor="paypalClientId">{simple ? "Client ID" : "PayPal sandbox client ID"}</label>
          <input id="paypalClientId" name="paypalClientId" type="text" defaultValue={settings.paypalClientId ?? ""} autoComplete="off" />
          <label htmlFor="paypalClientSecret">{simple ? "Secret" : "PayPal sandbox client secret"}</label>
          <input id="paypalClientSecret" name="paypalClientSecret" type="password" placeholder={saved(settings.paypalClientSecret)} autoComplete="new-password" />
          <label htmlFor="stripeSecretKey">{simple ? "Stripe test key (optional, starts with sk_test_)" : "Stripe test secret key"}</label>
          <input id="stripeSecretKey" name="stripeSecretKey" type="password" placeholder={saved(settings.stripeSecretKey, "sk_test_…")} autoComplete="new-password" />
        </div>
        <div>
          <label htmlFor="buyerEmail">{simple ? "Test shopper email" : "Sandbox buyer email"}</label>
          <input id="buyerEmail" name="buyerEmail" type="email" placeholder={saved(settings.buyerEmail, "sb-…@personal.example.com")} autoComplete="off" />
          <label htmlFor="buyerPassword">{simple ? "Test shopper password" : "Sandbox buyer password"}</label>
          <input id="buyerPassword" name="buyerPassword" type="password" placeholder={saved(settings.buyerPassword)} autoComplete="new-password" />
          {!simple && (
            <>
              <label htmlFor="appDir">App folder in the repository</label>
              <input id="appDir" name="appDir" type="text" defaultValue={settings.appDir} />
              <p className="hint">Use . when the store is at the repository root.</p>
            </>
          )}
        </div>
      </div>
      <div className="actions">
        <button className="btn secondary" type="submit">
          {simple ? "Save test account" : "Save settings"}
        </button>
      </div>
      <p className="hint">These are test-mode details only. They&apos;re encrypted, never shown again, and never used for real payments.</p>
    </form>
  );
}

function PayPalGuide() {
  return (
    <ol className="guide small">
      <li>
        Go to <a href="https://developer.paypal.com/dashboard/">developer.paypal.com</a> and log in with any PayPal account (it&apos;s free).
      </li>
      <li>
        Make sure <strong>Sandbox</strong> (test mode) is selected at the top, open <strong>Apps &amp; Credentials</strong>, and click <strong>Create App</strong>.
      </li>
      <li>
        Copy the <strong>Client ID</strong> and the <strong>Secret</strong> into the form below.
      </li>
      <li>
        Open <strong>Testing Tools → Sandbox Accounts</strong>, find the <strong>Personal</strong> account, and click <strong>⋯ → View/Edit</strong>. Copy its email and password: that&apos;s
        your test shopper.
      </li>
    </ol>
  );
}

export default async function StorePage({ params, searchParams }: PageProps<"/repos/[id]">) {
  await ensureDb();
  const { id } = await params;
  const user = await requireUser(`/repos/${id}`);
  const { saved } = await searchParams;
  const inst = await getInstallation(Number(id));
  if (!inst || !canAccess(user, inst)) notFound();
  const [settings, runs, view] = await Promise.all([getSandboxSettings(inst.id), listRuns(inst.id, 20), currentView()]);
  const adds = runs.filter((r) => r.kind === "add_paypal");
  const latestAdd: Run | undefined = adds[0];
  const added = adds.find((r) => r.status === "passed");
  const checks = runs.filter((r) => r.kind === "check");
  const inProgress = latestAdd && ["queued", "running", "awaiting_approval"].includes(latestAdd.status);
  const name = inst.repo_full_name.split("/")[1];

  if (view === "simple") {
    return (
      <>
        <div className="app-hero">
          <div>
            <p className="kicker">My store</p>
            <h1>{name}</h1>
            <p className="finding">
              {added ? "PayPal checkout has been added and tested. Here is what's left to do." : "Four steps to PayPal checkout. We'll guide you through each one."}
            </p>
            {saved && (
              <p style={{ marginTop: 12 }}>
                <Badge status="passed">Test account saved</Badge>
              </p>
            )}
          </div>
          <div className="app-hero-art">
            <StoreMock name={name} hasPayPal={!!added} />
          </div>
        </div>

        <ol className="steps">
          <li className={settings.configured ? "done" : "current"}>
            <h3>Connect your PayPal test account</h3>
            <p className="lede">
              {settings.configured
                ? "Done. We'll use your PayPal test account for the test purchases."
                : "PayPal gives every business a free test account (called the sandbox) where no real money moves. We use it to make test purchases on your store. You can skip this for now; we'll use our demo test account."}
            </p>
            <details className="dev" open={!settings.configured}>
              <summary>{settings.configured ? "Change test account" : "Show me how (2 minutes)"}</summary>
              <PayPalGuide />
              <SettingsForm installationId={inst.id} settings={settings} simple />
            </details>
          </li>

          <li className={added ? "done" : inProgress ? "current" : "current"}>
            <h3>Add PayPal to your store</h3>
            <p className="lede">
              {added
                ? "Done. PayPal checkout was built and passed its test purchases."
                : inProgress
                  ? "In progress. Our AI is working on it now."
                  : "Our AI reads your store, explains its plan for your OK, adds PayPal checkout next to your card payments, and tests it. This takes about 30 minutes."}
            </p>
            <div className="actions">
              {inProgress && latestAdd ? (
                <Link className="btn btn-lg" href={`/runs/${latestAdd.id}`}>
                  {latestAdd.status === "awaiting_approval" ? "Review the plan" : "See progress"} <Icon name="arrow" size={18} />
                </Link>
              ) : added ? (
                <Link className="btn secondary" href={`/runs/${added.id}`}>
                  See the results
                </Link>
              ) : (
                <form action={startAddPaypalAction}>
                  <input type="hidden" name="installationId" value={inst.id} />
                  <button className="btn btn-lg" type="submit">
                    <Icon name="spark" size={18} /> Add PayPal checkout
                  </button>
                </form>
              )}
            </div>
            {latestAdd && !inProgress && latestAdd.status !== "passed" && (
              <p className="small muted">Last attempt: {PLAIN_STATUS[latestAdd.status] ?? latestAdd.status}. You can start again any time.</p>
            )}
          </li>

          <li className={added?.pr_url ? "current" : "todo"}>
            <h3>Accept the change on GitHub</h3>
            <p className="lede">
              We hand you the finished change as a &ldquo;pull request&rdquo;: a proposed update to your store&apos;s code that you can review and accept. On GitHub, click the green{" "}
              <strong>Merge pull request</strong> button, then <strong>Confirm merge</strong>. Your website shows PayPal the next time it&apos;s published.
            </p>
            {added?.pr_url && (
              <div className="actions">
                <a className="btn btn-lg" href={added.pr_url}>
                  <Icon name="github" size={18} /> Open the change on GitHub
                </a>
              </div>
            )}
          </li>

          <li className={checks.length ? "done" : "todo"}>
            <h3>Stay protected</h3>
            <p className="lede">
              From then on, every proposed change to your store is re-tested with PayPal test purchases before you accept it. If something would break your checkout, you&apos;ll see a red
              warning on GitHub with a plain explanation.
            </p>
            {checks.length > 0 && (
              <ul className="facts">
                {checks.slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <Icon name="pulse" size={16} />
                    <Link href={`/runs/${c.id}`}>Change #{c.pr_number}</Link>
                    <Badge status={c.status}>{PLAIN_STATUS[c.status] ?? c.status}</Badge>
                    <span className="muted small">{formatDate(c.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        </ol>
      </>
    );
  }

  return (
    <>
      <div className="app-hero">
        <div>
          <p className="kicker">Repository</p>
          <h1>{inst.repo_full_name}</h1>
          <p className="finding">
            {added
              ? "PayPal checkout was added and proven in the sandbox. Every new pull request now gets a PayPal checkout check."
              : "Start the integration: the agent reads this store, shows you its plan, writes the code, and proves it with a real PayPal sandbox purchase."}
          </p>
          <form action={startAddPaypalAction} className="actions">
            <input type="hidden" name="installationId" value={inst.id} />
            <button className="btn btn-lg" type="submit">
              <Icon name="spark" size={18} /> {added ? "Run the integration again" : "Add PayPal checkout"}
            </button>
          </form>
        </div>
        <div className="app-hero-art">
          <StoreMock name={name} hasPayPal={!!added} />
        </div>
      </div>

      <section className="section">
        <h2>Runs</h2>
        {runs.length === 0 ? (
          <p className="muted">No runs yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Pull request</th>
                  <th className="num">Scenarios</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const s = r.summary as { passed?: number; total?: number } | null;
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/runs/${r.id}`}>{formatDate(r.created_at)}</Link>
                      </td>
                      <td>{kindLabel(r.kind)}</td>
                      <td>
                        <Badge status={r.status}>{statusLabel(r.status)}</Badge>
                      </td>
                      <td>{r.pr_number ? (r.pr_url ? <a href={r.pr_url}>#{r.pr_number}</a> : `#${r.pr_number}`) : ""}</td>
                      <td className="num">{s?.total ? `${s.passed} of ${s.total}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Sandbox settings</h2>
        <p className="lede">
          Sandbox and test-mode credentials the harness uses for this repository. Secrets are encrypted at rest and never shown again. Leave a secret field empty to keep the saved value.
          Anything left unset falls back to the worker&apos;s own sandbox credentials.
        </p>
        {saved && (
          <p>
            <Badge status="passed">Saved</Badge>
          </p>
        )}
        <SettingsForm installationId={inst.id} settings={settings} simple={false} />
      </section>
    </>
  );
}
