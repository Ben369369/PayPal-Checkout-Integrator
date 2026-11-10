import Link from "next/link";
import { getGithubApp, getSandboxSettings, listRuns, one } from "@paypal-checkout-integrator/shared";
import { Landing } from "@/components/Landing";
import { kindLabel, Status } from "@/components/Status";
import { currentUser, userStores } from "@/lib/auth";
import { PLAIN_STATUS } from "@/lib/plain";
import { ensureDb, formatDate } from "@/lib/server";
import { currentView } from "@/lib/view";
import { syncInstallationsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  await ensureDb();
  const { error } = await searchParams;
  const user = await currentUser();
  if (!user) {
    const featured = await one<{ id: string }>(`SELECT id FROM runs WHERE kind = 'add_paypal' AND status = 'passed' ORDER BY finished_at DESC LIMIT 1`);
    return <Landing reportUrl={featured ? `/runs/${featured.id}/report` : null} error={typeof error === "string" ? error : undefined} />;
  }

  const [view, app, stores] = await Promise.all([currentView(), getGithubApp(), userStores(user)]);
  const rows = await Promise.all(
    stores.map(async (inst) => ({ inst, settings: await getSandboxSettings(inst.id), latest: (await listRuns(inst.id, 1))[0] ?? null })),
  );
  const installUrl = app?.html_url ? `${app.html_url}/installations/new` : null;
  const simple = view === "simple";

  return (
    <>
      <p className="kicker">{simple ? "My stores" : "Repositories"}</p>
      <h1>{simple ? `Welcome, ${user.name ?? user.login}` : "Repositories you can add PayPal to"}</h1>
      <div className="big-number">
        {stores.length} <span className="of">{simple ? (stores.length === 1 ? "store connected" : "stores connected") : stores.length === 1 ? "repository connected" : "repositories connected"}</span>
      </div>
      <p className="finding">
        {stores.length
          ? simple
            ? "Choose a store to add PayPal checkout or see its latest test results."
            : "Pick a repository to set its sandbox credentials and start the PayPal integration."
          : simple
            ? "Connect the store you want PayPal on. GitHub will ask which store (repository) to share with us."
            : "Install the GitHub App on a repository to see it here."}
      </p>
      <div className="actions">
        {installUrl && (
          <a className="btn" href={installUrl}>
            {simple ? "Connect a store" : "Install on a repository"}
          </a>
        )}
        <form action={syncInstallationsAction}>
          <button className="btn secondary" type="submit">
            {simple ? "I connected a store, refresh" : "Refresh from GitHub"}
          </button>
        </form>
      </div>

      {rows.map(({ inst, settings, latest }) => (
        <section key={inst.id} className="section">
          <div className="grid-3">
            <div>
              <h2>
                <Link href={`/repos/${inst.id}`}>{simple ? inst.repo_full_name.split("/")[1] : inst.repo_full_name}</Link>
              </h2>
              <p className="muted small">{simple ? `On GitHub as ${inst.repo_full_name}` : `Default branch ${inst.default_branch}`}</p>
            </div>
            <dl className="details">
              <dt>{simple ? "PayPal test account" : "Sandbox"}</dt>
              <dd>
                {settings.configured
                  ? simple
                    ? "Connected"
                    : "Credentials set for this repository"
                  : simple
                    ? "Using our demo test account"
                    : "Using the worker's default sandbox credentials"}
              </dd>
              {!simple && (
                <>
                  <dt>App folder</dt>
                  <dd>
                    <code>{settings.appDir}</code>
                  </dd>
                </>
              )}
            </dl>
            <dl className="details">
              <dt>{simple ? "Latest" : "Latest run"}</dt>
              <dd>
                {latest ? (
                  <Link href={`/runs/${latest.id}`}>
                    {simple ? (latest.kind === "add_paypal" ? "Adding PayPal" : "Re-test of a change") : kindLabel(latest.kind)}:{" "}
                    {simple ? <span className={latest.status === "passed" ? "pass" : latest.status === "failed" || latest.status === "error" ? "fail" : "skipped"}>{PLAIN_STATUS[latest.status] ?? latest.status}</span> : <Status value={latest.status} />}
                  </Link>
                ) : (
                  <span className="muted">{simple ? "Nothing yet" : "None yet"}</span>
                )}
              </dd>
              {latest && (
                <>
                  <dt>When</dt>
                  <dd>{formatDate(latest.created_at)}</dd>
                </>
              )}
            </dl>
          </div>
        </section>
      ))}
    </>
  );
}
