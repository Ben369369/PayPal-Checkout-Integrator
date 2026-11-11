import Link from "next/link";
import { getGithubApp, getSandboxSettings, listRuns, one, workerStatus } from "@paypal-checkout-integrator/shared";
import { Landing } from "@/components/Landing";
import { Badge, ScoreRing, StoreMock } from "@/components/app/Visuals";
import { Icon } from "@/components/landing/Icons";
import { kindLabel, statusLabel } from "@/components/Status";
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
    const [featured, caught, robot] = await Promise.all([
      one<{ id: string; video_url: string | null; pr_url: string | null }>(
        `SELECT r.id, r.pr_url, s.video_url FROM runs r LEFT JOIN scenario_results s ON s.run_id = r.id AND s.scenario = 1
         WHERE r.kind = 'add_paypal' AND r.status = 'passed' ORDER BY r.finished_at DESC LIMIT 1`,
      ),
      one<{ id: string; pr_url: string | null }>(
        `SELECT r.id, COALESCE(r.pr_url, 'https://github.com/' || i.repo_full_name || '/pull/' || r.pr_number) AS pr_url
         FROM runs r JOIN installations i ON i.id = r.installation_id
         WHERE r.kind = 'check' AND r.status = 'failed' AND r.pr_number IS NOT NULL ORDER BY r.finished_at DESC LIMIT 1`,
      ),
      workerStatus().catch(() => null),
    ]);
    return (
      <Landing
        reportUrl={featured ? `/runs/${featured.id}/report` : null}
        videoUrl={featured?.video_url ?? null}
        prUrl={featured?.pr_url ?? null}
        caughtReportUrl={caught ? `/runs/${caught.id}/report` : null}
        caughtPrUrl={caught?.pr_url ?? null}
        robotOnline={robot?.online ?? false}
        error={typeof error === "string" ? error : undefined}
      />
    );
  }

  const [view, app, stores] = await Promise.all([currentView(), getGithubApp(), userStores(user)]);
  const rows = await Promise.all(
    stores.map(async (inst) => {
      const [settings, runs] = await Promise.all([getSandboxSettings(inst.id), listRuns(inst.id, 20)]);
      return { inst, settings, latest: runs[0] ?? null, added: runs.some((r) => r.kind === "add_paypal" && r.status === "passed") };
    }),
  );
  const installUrl = app?.html_url ? `${app.html_url}/installations/new` : null;
  const simple = view === "simple";
  const withPayPal = rows.filter((r) => r.added).length;

  const connect = (
    <div className="actions">
      {installUrl && (
        <a className="btn btn-lg" href={installUrl}>
          <Icon name="plus" size={18} /> {simple ? "Connect a store" : "Install on a repository"}
        </a>
      )}
      <form action={syncInstallationsAction}>
        <button className="btn btn-lg secondary" type="submit">
          {simple ? "I connected a store, refresh" : "Refresh from GitHub"}
        </button>
      </form>
    </div>
  );

  return (
    <>
      <div className="app-hero">
        <div>
          <p className="kicker">{simple ? "My stores" : "Repositories"}</p>
          <h1>{simple ? `Welcome, ${user.name ?? user.login}` : "Repositories you can add PayPal to"}</h1>
          <p className="finding">
            {stores.length
              ? simple
                ? "Choose a store to add PayPal checkout or see its latest test results."
                : "Pick a repository to set its sandbox credentials and start the PayPal integration."
              : simple
                ? "Connect the store you want PayPal on. GitHub will ask which store (repository) to share with us."
                : "Install the GitHub App on a repository to see it here."}
          </p>
          {stores.length > 0 && connect}
        </div>
        {stores.length > 0 && (
          <div className="app-hero-art">
            <ScoreRing passed={withPayPal} total={stores.length} label={simple ? "have PayPal" : "integrated"} />
          </div>
        )}
      </div>

      {stores.length === 0 && (
        <section className="section">
          <div className="empty">
            <StoreMock name="your-store" hasPayPal={false} />
            <div>
              <h2>{simple ? "Let's connect your first store" : "No repositories yet"}</h2>
              <p className="lede">
                {simple
                  ? "Your store's code lives on GitHub. Click Connect a store, pick the repository, and come back here. Nothing changes on your store until you approve a plan."
                  : "Install the GitHub App on the repository that holds the Next.js store, then refresh."}
              </p>
              {connect}
            </div>
          </div>
        </section>
      )}

      <div className="store-grid">
        {rows.map(({ inst, settings, latest, added }) => {
          const name = inst.repo_full_name.split("/")[1];
          return (
            <div key={inst.id} className="store-card">
              <StoreMock name={name} hasPayPal={added} compact />
              <div>
                <h2>
                  <Link href={`/repos/${inst.id}`}>{simple ? name : inst.repo_full_name}</Link>
                </h2>
                <p className="muted small" style={{ margin: 0 }}>
                  {simple ? `On GitHub as ${inst.repo_full_name}` : `Default branch ${inst.default_branch} · app folder ${settings.appDir}`}
                </p>
                <ul className="facts">
                  <li>
                    <Icon name="store" size={16} />
                    {added ? <Badge status="passed">{simple ? "PayPal added" : "Integrated"}</Badge> : <Badge status="neutral">{simple ? "No PayPal yet" : "Not integrated"}</Badge>}
                  </li>
                  <li>
                    <Icon name="lock" size={16} />
                    {settings.configured ? (simple ? "Your PayPal test account" : "Own sandbox credentials") : simple ? "Using our demo test account" : "Worker's default sandbox credentials"}
                  </li>
                  <li>
                    <Icon name="pulse" size={16} />
                    {latest ? (
                      <Link href={`/runs/${latest.id}`}>
                        <Badge status={latest.status}>
                          {simple ? (latest.kind === "add_paypal" ? "Adding PayPal" : `Change #${latest.pr_number}`) : kindLabel(latest.kind)}: {simple ? (PLAIN_STATUS[latest.status] ?? latest.status) : statusLabel(latest.status)}
                        </Badge>
                      </Link>
                    ) : (
                      <span className="muted">{simple ? "Nothing yet" : "No runs yet"}</span>
                    )}
                    {latest && <span className="muted small">{formatDate(latest.created_at)}</span>}
                  </li>
                </ul>
                <Link className="btn" href={`/repos/${inst.id}`}>
                  {simple ? (added ? "Open store" : "Add PayPal") : "Open"} <Icon name="arrow" size={16} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
