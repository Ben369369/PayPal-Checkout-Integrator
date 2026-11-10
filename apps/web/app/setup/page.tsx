import { getGithubApp, listInstallations } from "@paypal-checkout-integrator/shared";
import { notFound } from "next/navigation";
import { currentUser, isOperator } from "@/lib/auth";
import { ensureDb, publicUrl } from "@/lib/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup" };

/** GitHub App manifest: lets the owner create the app with the right permissions in one step. */
function manifest(base: string) {
  return {
    name: "PayPal Checkout Integrator",
    url: base,
    description: "Adds PayPal checkout to a Stripe-only store, proves it with a real PayPal sandbox purchase, and opens a pull request. By Chui Labs.",
    hook_attributes: { url: `${base}/api/github/webhook`, active: true },
    redirect_url: `${base}/api/github/manifest/callback`,
    // "Sign in with GitHub" for store owners.
    callback_urls: [`${base}/api/auth/callback`],
    setup_url: `${base}/`,
    setup_on_update: true,
    public: true,
    default_permissions: { contents: "write", pull_requests: "write", checks: "write", metadata: "read" },
    default_events: ["pull_request", "check_run", "repository"],
  };
}

export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  await ensureDb();
  const { error } = await searchParams;
  const [app, installations] = await Promise.all([getGithubApp(), listInstallations()]);
  // Before the app exists anyone may create it (first deploy); afterwards only its owner sees this page.
  if (app && !(await isOperator(await currentUser()))) notFound();
  const base = publicUrl();
  const httpsOk = base.startsWith("https://");

  return (
    <>
      <p className="kicker">Setup</p>
      <h1>{app ? `${app.name} is set up` : "Create the GitHub App"}</h1>
      <p className="finding">
        {app
          ? `It's installed on ${installations.length} ${installations.length === 1 ? "repository" : "repositories"}. GitHub sends pull request events to ${base}/api/github/webhook.`
          : "One click creates the app on your GitHub account with exactly the permissions it needs: contents and pull requests (write), checks (write), metadata (read)."}
      </p>
      {error && <p className="fail">GitHub setup failed ({String(error)}). Try again.</p>}

      {!app && (
        <section className="section">
          {!httpsOk && <p className="fail">PUBLIC_URL must be the app&apos;s public https address before creating the GitHub App (currently {base}).</p>}
          <form action="https://github.com/settings/apps/new" method="post">
            <input type="hidden" name="manifest" value={JSON.stringify(manifest(base))} />
            <button className="btn" type="submit" disabled={!httpsOk}>
              Create the GitHub App
            </button>
          </form>
          <p className="hint">GitHub asks you to confirm the name; you can rename it there if the name is taken.</p>
        </section>
      )}

      {app && (
        <section className="section">
          <dl className="details">
            <dt>App</dt>
            <dd>{app.html_url ? <a href={app.html_url}>{app.name}</a> : app.name}</dd>
            <dt>Owner</dt>
            <dd>{app.owner}</dd>
            <dt>App ID</dt>
            <dd>
              <code>{app.app_id}</code>
            </dd>
            <dt>Webhook</dt>
            <dd>
              <code>{base}/api/github/webhook</code>
            </dd>
            <dt>Private key</dt>
            <dd>Stored encrypted in the database</dd>
          </dl>
          {app.html_url && (
            <div className="actions">
              <a className="btn" href={`${app.html_url}/installations/new`}>
                Install on a repository
              </a>
              <a className="btn secondary" href={`${app.html_url.replace("/apps/", "/settings/apps/")}`}>
                App settings on GitHub
              </a>
            </div>
          )}
        </section>
      )}
    </>
  );
}
