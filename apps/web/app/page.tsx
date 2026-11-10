import Link from "next/link";
import { getGithubApp, getSandboxSettings, listInstallations, listRuns } from "@paypal-checkout-integrator/shared";
import { kindLabel, Status } from "@/components/Status";
import { ensureDb, formatDate } from "@/lib/server";
import { syncInstallationsAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Repositories" };

export default async function ReposPage() {
  await ensureDb();
  const [app, installations] = await Promise.all([getGithubApp(), listInstallations()]);
  const rows = await Promise.all(
    installations.map(async (inst) => ({
      inst,
      settings: await getSandboxSettings(inst.id),
      latest: (await listRuns(inst.id, 1))[0] ?? null,
    })),
  );

  return (
    <>
      <p className="kicker">Repositories</p>
      <h1>Stores this app can add PayPal to</h1>
      <div className="big-number">
        {installations.length} <span className="of">{installations.length === 1 ? "repository" : "repositories"} connected</span>
      </div>
      <p className="finding">
        {app
          ? installations.length
            ? "Pick a repository to set its sandbox credentials and start the PayPal integration."
            : `Install ${app.name} on a repository to see it here.`
          : "The GitHub App isn't set up yet. Start on the Setup page."}
      </p>
      <div className="actions">
        {app ? (
          <>
            {app.html_url && (
              <a className="btn" href={`${app.html_url}/installations/new`}>
                Install on a repository
              </a>
            )}
            <form action={syncInstallationsAction}>
              <button className="btn secondary" type="submit">
                Refresh from GitHub
              </button>
            </form>
          </>
        ) : (
          <Link className="btn" href="/setup">
            Set up the GitHub App
          </Link>
        )}
      </div>

      {rows.map(({ inst, settings, latest }) => (
        <section key={inst.id} className="section">
          <div className="grid-3">
            <div>
              <h2>
                <Link href={`/repos/${inst.id}`}>{inst.repo_full_name}</Link>
              </h2>
              <p className="muted small">Default branch {inst.default_branch}</p>
            </div>
            <dl className="details">
              <dt>Sandbox</dt>
              <dd>{settings.configured ? "Credentials set for this repository" : "Using the worker's default sandbox credentials"}</dd>
              <dt>App folder</dt>
              <dd>
                <code>{settings.appDir}</code>
              </dd>
            </dl>
            <dl className="details">
              <dt>Latest run</dt>
              <dd>
                {latest ? (
                  <Link href={`/runs/${latest.id}`}>
                    {kindLabel(latest.kind)}: <Status value={latest.status} />
                  </Link>
                ) : (
                  <span className="muted">None yet</span>
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
