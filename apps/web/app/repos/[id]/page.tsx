import Link from "next/link";
import { notFound } from "next/navigation";
import { getInstallation, getSandboxSettings, listRuns } from "@paypal-checkout-integrator/shared";
import { kindLabel, Status } from "@/components/Status";
import { ensureDb, formatDate } from "@/lib/server";
import { saveSettingsAction, startAddPaypalAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function RepoPage({ params, searchParams }: PageProps<"/repos/[id]">) {
  await ensureDb();
  const { id } = await params;
  const { saved } = await searchParams;
  const inst = await getInstallation(Number(id));
  if (!inst) notFound();
  const [settings, runs] = await Promise.all([getSandboxSettings(inst.id), listRuns(inst.id, 20)]);
  const added = runs.find((r) => r.kind === "add_paypal" && r.status === "passed");

  return (
    <>
      <p className="kicker">Repository</p>
      <h1>{inst.repo_full_name}</h1>
      <p className="finding">
        {added
          ? "PayPal checkout was added and proven in the sandbox. Every new pull request now gets a PayPal checkout check."
          : "Start the integration: the agent reads this store, shows you its plan, writes the code, and proves it with a real PayPal sandbox purchase."}
      </p>
      <form action={startAddPaypalAction} className="actions">
        <input type="hidden" name="installationId" value={inst.id} />
        <button className="btn" type="submit">
          {added ? "Run the integration again" : "Add PayPal checkout"}
        </button>
      </form>

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
                        <Status value={r.status} />
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
          Sandbox and test-mode credentials the harness uses for this repository. Secrets are encrypted at rest and never shown again. Leave a
          secret field empty to keep the saved value. Anything left unset falls back to the worker&apos;s own sandbox credentials.
        </p>
        {saved && <p className="pass">Saved.</p>}
        <form action={saveSettingsAction}>
          <input type="hidden" name="installationId" value={inst.id} />
          <div className="grid-2">
            <div>
              <label htmlFor="paypalClientId">PayPal sandbox client ID</label>
              <input id="paypalClientId" name="paypalClientId" type="text" defaultValue={settings.paypalClientId ?? ""} autoComplete="off" />
              <label htmlFor="paypalClientSecret">PayPal sandbox client secret</label>
              <input id="paypalClientSecret" name="paypalClientSecret" type="password" placeholder={settings.paypalClientSecret ? "Saved" : ""} autoComplete="new-password" />
              <label htmlFor="stripeSecretKey">Stripe test secret key</label>
              <input id="stripeSecretKey" name="stripeSecretKey" type="password" placeholder={settings.stripeSecretKey ? "Saved" : "sk_test_…"} autoComplete="new-password" />
            </div>
            <div>
              <label htmlFor="buyerEmail">Sandbox buyer email</label>
              <input id="buyerEmail" name="buyerEmail" type="email" placeholder={settings.buyerEmail ? "Saved" : "sb-…@personal.example.com"} autoComplete="off" />
              <label htmlFor="buyerPassword">Sandbox buyer password</label>
              <input id="buyerPassword" name="buyerPassword" type="password" placeholder={settings.buyerPassword ? "Saved" : ""} autoComplete="new-password" />
              <label htmlFor="appDir">App folder in the repository</label>
              <input id="appDir" name="appDir" type="text" defaultValue={settings.appDir} />
              <p className="hint">Use . when the store is at the repository root.</p>
            </div>
          </div>
          <div className="actions">
            <button className="btn secondary" type="submit">
              Save settings
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
